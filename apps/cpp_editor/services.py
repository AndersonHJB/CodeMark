import os
import shutil
import signal
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings


MAX_CODE_BYTES = 100 * 1024
MAX_STDIN_BYTES = 32 * 1024
MAX_OUTPUT_BYTES = 64 * 1024
COMPILE_TIMEOUT_SECONDS = 12
RUN_TIMEOUT_SECONDS = 3


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


def compile_and_run_cpp(code, stdin_text=""):
    code, code_truncated = _limit_text(
        code,
        _setting_int("CPP_EDITOR_MAX_CODE_BYTES", MAX_CODE_BYTES),
    )
    stdin_text, stdin_truncated = _limit_text(
        stdin_text,
        _setting_int("CPP_EDITOR_MAX_STDIN_BYTES", MAX_STDIN_BYTES),
    )
    if code_truncated:
        return {
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
        return {
            "ok": False,
            "stage": "environment",
            "stdout": "",
            "stderr": "未找到 C++ 编译器。请在服务器安装 g++ 或 clang++，也可以通过 CODEMARK_CPP_COMPILER 指定编译器路径。",
            "exit_code": None,
            "timed_out": False,
            "output_truncated": False,
        }

    compile_timeout = _setting_int("CPP_EDITOR_COMPILE_TIMEOUT_SECONDS", COMPILE_TIMEOUT_SECONDS)
    run_timeout = _setting_int("CPP_EDITOR_RUN_TIMEOUT_SECONDS", RUN_TIMEOUT_SECONDS)
    max_output_bytes = _setting_int("CPP_EDITOR_MAX_OUTPUT_BYTES", MAX_OUTPUT_BYTES)

    with tempfile.TemporaryDirectory(prefix="codemark_cpp_") as temp_dir:
        workdir = Path(temp_dir)
        source_path = workdir / "main.cpp"
        executable_path = workdir / ("main.exe" if os.name == "nt" else "main")
        source_path.write_text(code, encoding="utf-8")

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
            return {
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
            return {
                "ok": False,
                "stage": "compile",
                "stdout": compile_stdout,
                "stderr": compile_stderr,
                "exit_code": compile_result.returncode,
                "timed_out": False,
                "output_truncated": compile_stdout_truncated or compile_stderr_truncated,
            }

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
