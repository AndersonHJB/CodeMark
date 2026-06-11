import tempfile
from unittest.mock import patch

from django.test import Client, SimpleTestCase, override_settings
from django.urls import resolve, reverse

from .services import compile_and_run_cpp
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

    def test_desktop_cpp_editor_has_context_menu(self):
        response = self.client.get(reverse("cpp_editor"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="custom-context-menu"')
        self.assertContains(response, "代码格式化")
        self.assertContains(response, "复制分享链接")

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
