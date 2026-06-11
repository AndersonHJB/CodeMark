import codecs
import os
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

try:
    import pty
except ImportError:
    pty = None

from django.conf import settings

from apps.common.project_payload import normalize_project_relative_path


MAX_CODE_BYTES = 100 * 1024
MAX_STDIN_BYTES = 32 * 1024
MAX_OUTPUT_BYTES = 64 * 1024
COMPILE_TIMEOUT_SECONDS = 12
RUN_TIMEOUT_SECONDS = 3
INTERACTIVE_RUN_TIMEOUT_SECONDS = 60
INTERACTIVE_SESSION_FINISHED_TTL_SECONDS = 30
MAX_INTERACTIVE_SESSIONS = 16

_interactive_sessions = {}
_interactive_sessions_lock = threading.Lock()


def _setting_int(name, default):
    try:
        return int(getattr(settings, name, default))
    except (TypeError, ValueError):
        return default


def _limit_text(value, max_bytes):
    raw = str(value or "")
    encoded = raw.encode("utf-8")
    if len(encoded) <= max_bytes:
        return raw, False
    truncated = encoded[:max_bytes].decode("utf-8", errors="ignore")
    return truncated, True


def _find_cpp_compiler():
    configured = os.getenv("CODEMARK_CPP_COMPILER", "").strip()
    candidates = [configured] if configured else []
    candidates.extend(["g++", "clang++"])
    for candidate in candidates:
        if not candidate:
            continue
        compiler = shutil.which(candidate)
        if compiler:
            return compiler
    return ""


def _compiler_environment():
    env = os.environ.copy()
    env.setdefault("LANG", "C.UTF-8")
    env.setdefault("LC_ALL", "C.UTF-8")
    return env


def _materialize_project_payload(workdir, project_payload, active_file):
    if not isinstance(project_payload, dict):
        return None, ""

    max_code_bytes = _setting_int("CPP_EDITOR_MAX_CODE_BYTES", MAX_CODE_BYTES)
    text_files = project_payload.get("text_files", [])
    if not isinstance(text_files, list):
        text_files = []

    active_path = normalize_project_relative_path(active_file or project_payload.get("active_file", ""))
    written_paths = set()
    for index, file_item in enumerate(text_files):
        if not isinstance(file_item, dict):
            continue
        safe_path = normalize_project_relative_path(
            file_item.get("path") or file_item.get("name") or f"file_{index + 1}.cpp"
        )
        if not safe_path:
            continue
        content, truncated = _limit_text(file_item.get("content", ""), max_code_bytes)
        if truncated:
            return None, f"项目文件过长，已拒绝运行：{safe_path}"
        target_path = workdir / safe_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(content, encoding="utf-8")
        written_paths.add(safe_path)

    if active_path and active_path in written_paths:
        return workdir / active_path, ""
    return None, ""


def _set_child_limits():
    try:
        import resource
    except ImportError:
        return

    output_limit = _setting_int("CPP_EDITOR_MAX_OUTPUT_BYTES", MAX_OUTPUT_BYTES)
    limits = [
        ("RLIMIT_CPU", _setting_int("CPP_EDITOR_RUN_TIMEOUT_SECONDS", RUN_TIMEOUT_SECONDS) + 1),
        ("RLIMIT_FSIZE", max(output_limit * 2, 1024 * 1024)),
        ("RLIMIT_NOFILE", 32),
        ("RLIMIT_NPROC", 64),
        ("RLIMIT_AS", 256 * 1024 * 1024),
    ]
    for limit_name, limit_value in limits:
        limit = getattr(resource, limit_name, None)
        if limit is None:
            continue
        try:
            resource.setrlimit(limit, (limit_value, limit_value))
        except (OSError, ValueError):
            continue


def _read_limited_text(file_obj, max_bytes):
    file_obj.seek(0)
    data = file_obj.read(max_bytes + 1)
    truncated = len(data) > max_bytes
    return data[:max_bytes].decode("utf-8", errors="replace"), truncated


def _kill_process_tree(process):
    if process.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
    except ProcessLookupError:
        return
    except OSError:
        process.kill()


def _run_executable(executable_path, stdin_text, timeout_seconds, max_output_bytes, cwd):
    stdin_bytes = stdin_text.encode("utf-8")
    with tempfile.TemporaryFile() as stdout_file, tempfile.TemporaryFile() as stderr_file:
        process = subprocess.Popen(
            [str(executable_path)],
            stdin=subprocess.PIPE,
            stdout=stdout_file,
            stderr=stderr_file,
            cwd=str(cwd),
            env=_compiler_environment(),
            preexec_fn=_set_child_limits if os.name == "posix" else None,
            start_new_session=os.name == "posix",
        )
        timed_out = False
        try:
            process.communicate(input=stdin_bytes, timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            _kill_process_tree(process)
            process.communicate()

        stdout, stdout_truncated = _read_limited_text(stdout_file, max_output_bytes)
        stderr, stderr_truncated = _read_limited_text(stderr_file, max_output_bytes)
        return {
            "stage": "run",
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": process.returncode,
            "timed_out": timed_out,
            "output_truncated": stdout_truncated or stderr_truncated,
        }


def _compile_cpp_executable(code, project_payload, active_file, workdir):
    code, code_truncated = _limit_text(
        code,
        _setting_int("CPP_EDITOR_MAX_CODE_BYTES", MAX_CODE_BYTES),
    )
    if code_truncated:
        return None, {
            "ok": False,
            "stage": "validate",
            "stdout": "",
            "stderr": "代码过长，已拒绝运行。",
            "exit_code": None,
            "timed_out": False,
            "output_truncated": False,
        }

    compiler = _find_cpp_compiler()
    if not compiler:
        return None, {
            "ok": False,
            "stage": "environment",
            "stdout": "",
            "stderr": "未找到 C++ 编译器。请在服务器安装 g++ 或 clang++，也可以通过 CODEMARK_CPP_COMPILER 指定编译器路径。",
            "exit_code": None,
            "timed_out": False,
            "output_truncated": False,
        }

    compile_timeout = _setting_int("CPP_EDITOR_COMPILE_TIMEOUT_SECONDS", COMPILE_TIMEOUT_SECONDS)
    max_output_bytes = _setting_int("CPP_EDITOR_MAX_OUTPUT_BYTES", MAX_OUTPUT_BYTES)

    source_path, payload_error = _materialize_project_payload(workdir, project_payload, active_file)
    if payload_error:
        return None, {
            "ok": False,
            "stage": "validate",
            "stdout": "",
            "stderr": payload_error,
            "exit_code": None,
            "timed_out": False,
            "output_truncated": False,
        }
    if source_path is None:
        source_path = workdir / "main.cpp"
        source_path.write_text(code, encoding="utf-8")
    executable_path = workdir / ("main.exe" if os.name == "nt" else "main")

    compile_command = [
        compiler,
        str(source_path),
        "-std=c++17",
        "-O2",
        "-pipe",
        "-o",
        str(executable_path),
    ]
    try:
        compile_result = subprocess.run(
            compile_command,
            cwd=str(workdir),
            env=_compiler_environment(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=compile_timeout,
        )
    except subprocess.TimeoutExpired as exc:
        stdout, stdout_truncated = _limit_text(exc.stdout or "", max_output_bytes)
        stderr, stderr_truncated = _limit_text(exc.stderr or "", max_output_bytes)
        return None, {
            "ok": False,
            "stage": "compile",
            "stdout": stdout,
            "stderr": stderr + f"\n编译超时（超过 {compile_timeout} 秒）。",
            "exit_code": None,
            "timed_out": True,
            "output_truncated": stdout_truncated or stderr_truncated,
        }

    compile_stdout, compile_stdout_truncated = _limit_text(compile_result.stdout, max_output_bytes)
    compile_stderr, compile_stderr_truncated = _limit_text(compile_result.stderr, max_output_bytes)
    if compile_result.returncode != 0:
        return None, {
            "ok": False,
            "stage": "compile",
            "stdout": compile_stdout,
            "stderr": compile_stderr,
            "exit_code": compile_result.returncode,
            "timed_out": False,
            "output_truncated": compile_stdout_truncated or compile_stderr_truncated,
        }

    return executable_path, None


def compile_and_run_cpp(code, stdin_text="", project_payload=None, active_file=""):
    stdin_text, stdin_truncated = _limit_text(
        stdin_text,
        _setting_int("CPP_EDITOR_MAX_STDIN_BYTES", MAX_STDIN_BYTES),
    )

    run_timeout = _setting_int("CPP_EDITOR_RUN_TIMEOUT_SECONDS", RUN_TIMEOUT_SECONDS)
    max_output_bytes = _setting_int("CPP_EDITOR_MAX_OUTPUT_BYTES", MAX_OUTPUT_BYTES)

    with tempfile.TemporaryDirectory(prefix="codemark_cpp_") as temp_dir:
        workdir = Path(temp_dir)
        executable_path, compile_error = _compile_cpp_executable(code, project_payload, active_file, workdir)
        if compile_error:
            return compile_error

        run_result = _run_executable(
            executable_path=executable_path,
            stdin_text=stdin_text,
            timeout_seconds=run_timeout,
            max_output_bytes=max_output_bytes,
            cwd=workdir,
        )
        if stdin_truncated:
            run_result["stderr"] += "\n[stdin 超过限制，已截断后运行。]"
        run_result["ok"] = not run_result["timed_out"] and run_result["exit_code"] == 0
        return run_result


class CppInteractiveSession:
    def __init__(
        self,
        process,
        temp_dir,
        timeout_seconds,
        max_output_bytes,
        max_stdin_bytes,
        pty_master_fd=None,
    ):
        self.process = process
        self.temp_dir = temp_dir
        self.pty_master_fd = pty_master_fd
        self.terminal_echo = pty_master_fd is not None
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes
        self.max_stdin_bytes = max_stdin_bytes
        self.created_at = time.monotonic()
        self.last_active_at = self.created_at
        self.events = []
        self.next_sequence = 1
        self.output_bytes = 0
        self.stdin_bytes = 0
        self.output_truncated = False
        self.finished = False
        self.cleaned_up = False
        self.timed_out = False
        self.exit_code = None
        self.lock = threading.Lock()
        self.reader_threads = []
        self.timeout_timer = threading.Timer(timeout_seconds, self._timeout)
        self.timeout_timer.daemon = True
        self.watcher_thread = threading.Thread(target=self._watch_process, daemon=True)

    def start(self):
        if self.pty_master_fd is not None:
            thread = threading.Thread(
                target=self._read_fd,
                args=("stdout", self.pty_master_fd),
                daemon=True,
            )
            self.reader_threads.append(thread)
            thread.start()
        else:
            for stream_name, pipe in (("stdout", self.process.stdout), ("stderr", self.process.stderr)):
                thread = threading.Thread(
                    target=self._read_pipe,
                    args=(stream_name, pipe),
                    daemon=True,
                )
                self.reader_threads.append(thread)
                thread.start()
        self.timeout_timer.start()
        self.watcher_thread.start()

    def _read_fd(self, stream_name, fd):
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        try:
            while True:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                text = decoder.decode(chunk)
                self._append_event(stream_name, text)
            tail = decoder.decode(b"", final=True)
            if tail:
                self._append_event(stream_name, tail)
        except OSError:
            return
        finally:
            self._close_pty()

    def _read_pipe(self, stream_name, pipe):
        try:
            self._read_fd(stream_name, pipe.fileno())
        finally:
            try:
                pipe.close()
            except OSError:
                pass

    def _append_event(self, stream_name, text):
        if not text:
            return
        if self.terminal_echo:
            text = text.replace("\r\n", "\n").replace("\r", "\n")

        should_kill = False
        with self.lock:
            if self.output_bytes >= self.max_output_bytes:
                return
            raw = text.encode("utf-8")
            if self.output_bytes + len(raw) > self.max_output_bytes:
                allowed = max(0, self.max_output_bytes - self.output_bytes)
                text = raw[:allowed].decode("utf-8", errors="ignore")
                raw = text.encode("utf-8")
                self.output_truncated = True
                should_kill = True
            self.output_bytes += len(raw)
            if text:
                self.events.append({
                    "seq": self.next_sequence,
                    "stream": stream_name,
                    "text": text,
                })
                self.next_sequence += 1
            if self.output_truncated:
                self.events.append({
                    "seq": self.next_sequence,
                    "stream": "system",
                    "text": "\n[输出已截断]\n",
                })
                self.next_sequence += 1
                self.output_bytes = self.max_output_bytes
            self.last_active_at = time.monotonic()

        if should_kill:
            self.stop()

    def _watch_process(self):
        try:
            self.process.wait()
        finally:
            for thread in self.reader_threads:
                thread.join(timeout=0.2)
            self.timeout_timer.cancel()
            with self.lock:
                self.exit_code = self.process.returncode
                self.finished = True
                self.last_active_at = time.monotonic()

    def _timeout(self):
        with self.lock:
            if self.finished:
                return
            self.timed_out = True
        self.stop()

    def stop(self):
        _kill_process_tree(self.process)
        self._close_pty()
        try:
            if self.process.stdin:
                self.process.stdin.close()
        except OSError:
            pass

    def _close_pty(self):
        if self.pty_master_fd is None:
            return
        try:
            os.close(self.pty_master_fd)
        except OSError:
            pass
        self.pty_master_fd = None

    def write_stdin(self, value):
        payload = (str(value or "") + "\n").encode("utf-8")
        with self.lock:
            if self.finished or self.process.poll() is not None:
                return False, "程序已经结束。"
            if self.stdin_bytes + len(payload) > self.max_stdin_bytes:
                return False, "stdin 超过限制，已拒绝继续输入。"
            self.stdin_bytes += len(payload)
            self.last_active_at = time.monotonic()

        try:
            if self.pty_master_fd is not None:
                os.write(self.pty_master_fd, payload)
            else:
                self.process.stdin.write(payload)
                self.process.stdin.flush()
        except (BrokenPipeError, OSError, ValueError):
            return False, "程序已经结束。"
        return True, ""

    def snapshot(self, after_sequence):
        with self.lock:
            events = [event for event in self.events if event["seq"] > after_sequence]
            return {
                "ok": True,
                "events": events,
                "next_seq": self.next_sequence,
                "done": self.finished,
                "exit_code": self.exit_code,
                "timed_out": self.timed_out,
                "output_truncated": self.output_truncated,
                "terminal_echo": self.terminal_echo,
            }

    def is_expired(self, now):
        with self.lock:
            if self.cleaned_up:
                return True
            if self.finished:
                return now - self.last_active_at > INTERACTIVE_SESSION_FINISHED_TTL_SECONDS
            return now - self.created_at > self.timeout_seconds + INTERACTIVE_SESSION_FINISHED_TTL_SECONDS

    def cleanup(self):
        with self.lock:
            if self.cleaned_up:
                return
            self.cleaned_up = True
        self.stop()
        try:
            self.temp_dir.cleanup()
        except OSError:
            pass


def _cleanup_interactive_sessions():
    now = time.monotonic()
    expired = []
    with _interactive_sessions_lock:
        for session_id, session in list(_interactive_sessions.items()):
            if session.is_expired(now):
                expired.append((session_id, session))
        for session_id, _session in expired:
            _interactive_sessions.pop(session_id, None)

        if len(_interactive_sessions) > MAX_INTERACTIVE_SESSIONS:
            sessions_by_age = sorted(
                _interactive_sessions.items(),
                key=lambda item: item[1].created_at,
            )
            overflow = len(_interactive_sessions) - MAX_INTERACTIVE_SESSIONS
            for session_id, session in sessions_by_age[:overflow]:
                _interactive_sessions.pop(session_id, None)
                expired.append((session_id, session))

    for _session_id, session in expired:
        session.cleanup()


def _get_interactive_session(session_id):
    _cleanup_interactive_sessions()
    with _interactive_sessions_lock:
        return _interactive_sessions.get(str(session_id or ""))


def start_interactive_cpp_run(code, project_payload=None, active_file=""):
    _cleanup_interactive_sessions()
    temp_dir = tempfile.TemporaryDirectory(prefix="codemark_cpp_interactive_")
    workdir = Path(temp_dir.name)
    executable_path, compile_error = _compile_cpp_executable(code, project_payload, active_file, workdir)
    if compile_error:
        temp_dir.cleanup()
        return {
            "ok": False,
            "done": True,
            "result": compile_error,
        }

    use_pty = os.name == "posix" and pty is not None
    pty_master_fd = None
    pty_slave_fd = None
    try:
        if use_pty:
            pty_master_fd, pty_slave_fd = pty.openpty()
            process = subprocess.Popen(
                [str(executable_path)],
                stdin=pty_slave_fd,
                stdout=pty_slave_fd,
                stderr=pty_slave_fd,
                cwd=str(workdir),
                env=_compiler_environment(),
                preexec_fn=_set_child_limits,
                start_new_session=True,
                close_fds=True,
                bufsize=0,
            )
            os.close(pty_slave_fd)
            pty_slave_fd = None
        else:
            process = subprocess.Popen(
                [str(executable_path)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(workdir),
                env=_compiler_environment(),
                preexec_fn=_set_child_limits if os.name == "posix" else None,
                start_new_session=os.name == "posix",
                bufsize=0,
            )
    except OSError as exc:
        for fd in (pty_master_fd, pty_slave_fd):
            if fd is None:
                continue
            try:
                os.close(fd)
            except OSError:
                pass
        temp_dir.cleanup()
        return {
            "ok": False,
            "done": True,
            "result": {
                "ok": False,
                "stage": "run",
                "stdout": "",
                "stderr": f"C++ 程序启动失败：{exc}",
                "exit_code": None,
                "timed_out": False,
                "output_truncated": False,
            },
        }

    timeout_seconds = _setting_int(
        "CPP_EDITOR_INTERACTIVE_RUN_TIMEOUT_SECONDS",
        INTERACTIVE_RUN_TIMEOUT_SECONDS,
    )
    session = CppInteractiveSession(
        process=process,
        temp_dir=temp_dir,
        timeout_seconds=timeout_seconds,
        max_output_bytes=_setting_int("CPP_EDITOR_MAX_OUTPUT_BYTES", MAX_OUTPUT_BYTES),
        max_stdin_bytes=_setting_int("CPP_EDITOR_MAX_STDIN_BYTES", MAX_STDIN_BYTES),
        pty_master_fd=pty_master_fd,
    )
    session_id = uuid.uuid4().hex
    with _interactive_sessions_lock:
        _interactive_sessions[session_id] = session
    session.start()
    return {
        "ok": True,
        "done": False,
        "session_id": session_id,
        "timeout_seconds": timeout_seconds,
        "terminal_echo": session.terminal_echo,
    }


def poll_interactive_cpp_run(session_id, after_sequence=0):
    try:
        after_sequence = int(after_sequence)
    except (TypeError, ValueError):
        after_sequence = 0

    session = _get_interactive_session(session_id)
    if not session:
        return {
            "ok": False,
            "events": [],
            "done": True,
            "stderr": "运行会话已结束或不存在。",
            "exit_code": None,
            "timed_out": False,
            "output_truncated": False,
        }

    snapshot = session.snapshot(after_sequence)
    if snapshot["done"]:
        with _interactive_sessions_lock:
            removed = _interactive_sessions.pop(str(session_id or ""), None)
        if removed:
            removed.cleanup()
    return snapshot


def send_interactive_cpp_stdin(session_id, value):
    session = _get_interactive_session(session_id)
    if not session:
        return {
            "ok": False,
            "done": True,
            "stderr": "运行会话已结束或不存在。",
        }
    ok, message = session.write_stdin(value)
    return {
        "ok": ok,
        "done": False,
        "stderr": message,
    }


def stop_interactive_cpp_run(session_id):
    session = None
    with _interactive_sessions_lock:
        session = _interactive_sessions.pop(str(session_id or ""), None)
    if session:
        session.cleanup()
        return {"ok": True}
    return {"ok": False}
