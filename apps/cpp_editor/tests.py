import tempfile
import time
from unittest.mock import patch

from django.test import Client, SimpleTestCase, override_settings
from django.urls import resolve, reverse

from .services import compile_and_run_cpp, poll_interactive_cpp_run, send_interactive_cpp_stdin, start_interactive_cpp_run
from . import views


class CppEditorUrlPatternTests(SimpleTestCase):
    def test_cpp_editor_route_uses_new_view(self):
        self.assertIs(resolve(reverse("cpp_editor")).func, views.cpp_editor)

    def test_run_cpp_route_returns_json_result(self):
        payload = {
            "ok": True,
            "stage": "run",
            "stdout": "Hello C++\n",
            "stderr": "",
            "exit_code": 0,
            "timed_out": False,
            "output_truncated": False,
        }
        with patch("apps.cpp_editor.views.compile_and_run_cpp", return_value=payload):
            response = self.client.post(reverse("run_cpp"), {"code": "int main(){}", "stdin": ""})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_interactive_cpp_routes_return_json_result(self):
        start_payload = {"ok": True, "done": False, "session_id": "abc123", "timeout_seconds": 60}
        poll_payload = {"ok": True, "events": [], "done": False, "exit_code": None}
        input_payload = {"ok": True, "done": False, "stderr": ""}
        stop_payload = {"ok": True}

        with patch("apps.cpp_editor.views.start_interactive_cpp_run", return_value=start_payload):
            start_response = self.client.post(reverse("start_cpp_run"), {"code": "int main(){}"})
        with patch("apps.cpp_editor.views.poll_interactive_cpp_run", return_value=poll_payload):
            poll_response = self.client.post(reverse("poll_cpp_run"), {"session_id": "abc123", "after_seq": "0"})
        with patch("apps.cpp_editor.views.send_interactive_cpp_stdin", return_value=input_payload):
            input_response = self.client.post(reverse("send_cpp_run_input"), {"session_id": "abc123", "stdin": "42"})
        with patch("apps.cpp_editor.views.stop_interactive_cpp_run", return_value=stop_payload):
            stop_response = self.client.post(reverse("stop_cpp_run"), {"session_id": "abc123"})

        self.assertEqual(start_response.json(), start_payload)
        self.assertEqual(poll_response.json(), poll_payload)
        self.assertEqual(input_response.json(), input_payload)
        self.assertEqual(stop_response.json(), stop_payload)

    def test_run_cpp_requires_csrf_when_checks_are_enforced(self):
        payload = {
            "ok": True,
            "stage": "run",
            "stdout": "",
            "stderr": "",
            "exit_code": 0,
            "timed_out": False,
            "output_truncated": False,
        }
        csrf_client = Client(enforce_csrf_checks=True)
        page_response = csrf_client.get(reverse("cpp_editor"))
        token = page_response.cookies["csrftoken"].value

        denied_response = csrf_client.post(reverse("run_cpp"), {"code": "int main(){}", "stdin": ""})
        self.assertEqual(denied_response.status_code, 403)

        with patch("apps.cpp_editor.views.compile_and_run_cpp", return_value=payload):
            allowed_response = csrf_client.post(
                reverse("run_cpp"),
                {"code": "int main(){}", "stdin": ""},
                HTTP_X_CSRFTOKEN=token,
            )

        self.assertEqual(allowed_response.status_code, 200)
        self.assertEqual(allowed_response.json(), payload)

    def test_mobile_user_agent_gets_mobile_cpp_editor(self):
        response = self.client.get(
            reverse("cpp_editor"),
            HTTP_USER_AGENT="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "C++在线代码编写（移动端）")
        self.assertContains(response, "mobile-console-output")
        self.assertNotContains(response, 'id="stdin-input"')
        self.assertNotContains(response, "cpp-mobile-stdin-btn")

    def test_desktop_cpp_editor_has_context_menu(self):
        response = self.client.get(reverse("cpp_editor"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="custom-context-menu"')
        self.assertContains(response, "代码格式化")
        self.assertContains(response, "复制分享链接")
        self.assertContains(response, "runStartUrl")
        self.assertNotContains(response, 'id="stdin-input"')
        self.assertNotContains(response, "cpp-stdin-panel")

    def test_shared_cpp_editor_uses_cpp_template(self):
        with tempfile.TemporaryDirectory() as temp_dir, override_settings(CODEMARK_SHARECODE_DIR=temp_dir):
            upload_response = self.client.post(reverse("upload_code"), {
                "code": "#include <iostream>\nint main(){std::cout << \"shared\";}\n",
                "language": "c_cpp",
                "template": "cpp_editor",
                "theme": "monokai",
            })
            self.assertEqual(upload_response.status_code, 200)
            project_id = upload_response.json()["project_id"]

            shared_response = self.client.get(reverse("show_shared_code", kwargs={"project_id": project_id}))

        self.assertEqual(shared_response.status_code, 200)
        self.assertContains(shared_response, "C++在线代码编写")
        self.assertContains(shared_response, "js/cpp_editor.js")

    def test_project_payload_files_are_available_to_compiler(self):
        payload = {
            "text_files": [
                {
                    "path": "src/main.cpp",
                    "language": "c_cpp",
                    "content": '#include "answer.h"\n#include <iostream>\nint main(){std::cout << answer() << "\\n";}\n',
                },
                {
                    "path": "src/answer.h",
                    "language": "c_cpp",
                    "content": "int answer(){ return 42; }\n",
                },
            ],
            "assets": [],
            "folders": ["src"],
            "active_file": "src/main.cpp",
        }

        result = compile_and_run_cpp("", project_payload=payload, active_file="src/main.cpp")

        self.assertTrue(result["ok"], result)
        self.assertEqual(result["stdout"], "42\n")

    def test_interactive_cpp_run_accepts_stdin_after_process_starts(self):
        code = (
            "#include <iostream>\n"
            "#include <string>\n"
            "int main(){"
            "std::cout << \"Name? \";"
            "std::string name;"
            "std::cin >> name;"
            "std::cout << \"Hello \" << name << \"\\n\";"
            "return 0;"
            "}\n"
        )
        start_result = start_interactive_cpp_run(code)
        self.assertTrue(start_result["ok"], start_result)
        session_id = start_result["session_id"]
        output = ""
        last_seq = 0
        deadline = time.time() + 5

        while "Name? " not in output and time.time() < deadline:
            poll_result = poll_interactive_cpp_run(session_id, last_seq)
            for event in poll_result.get("events", []):
                last_seq = max(last_seq, event["seq"])
                output += event["text"]
            if poll_result.get("done"):
                break
            time.sleep(0.05)

        self.assertIn("Name? ", output)
        input_result = send_interactive_cpp_stdin(session_id, "Ada")
        self.assertTrue(input_result["ok"], input_result)

        final_result = None
        deadline = time.time() + 5
        while time.time() < deadline:
            poll_result = poll_interactive_cpp_run(session_id, last_seq)
            for event in poll_result.get("events", []):
                last_seq = max(last_seq, event["seq"])
                output += event["text"]
            if poll_result.get("done"):
                final_result = poll_result
                break
            time.sleep(0.05)

        self.assertIsNotNone(final_result)
        self.assertEqual(final_result["exit_code"], 0)
        self.assertIn("Hello Ada\n", output)
