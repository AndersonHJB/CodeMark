import json
import os
import tempfile

from django.contrib.auth import get_user_model
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import resolve, reverse

from apps.common.project_payload import FILENAME_MARKER, FILE_LANGUAGE_MARKER

from . import views
from .share_files import get_shared_code_record, list_shared_code_records


class SharingUrlPatternTests(SimpleTestCase):
    def test_static_sharing_routes_keep_existing_names_and_paths(self):
        expected_routes = {
            "sharecode": (reverse("sharecode"), views.sharecode),
            "upload_code": (reverse("upload_code"), views.upload_code),
            "download_project_zip": (reverse("download_project_zip"), views.download_project_zip),
            "admin_share_files": (reverse("admin_share_files"), views.admin_share_files),
        }

        for route_name, (path, view_func) in expected_routes.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(path).func, view_func)

    def test_dynamic_sharing_routes_keep_existing_names_and_paths(self):
        expected_routes = {
            "get_shared_asset": (
                reverse(
                    "get_shared_asset",
                    kwargs={"project_id": "project-1", "asset_path": "images/logo.png"},
                ),
                views.get_shared_asset,
            ),
            "show_shared_code": (
                reverse("show_shared_code", kwargs={"project_id": "project-1"}),
                views.show_shared_code,
            ),
            "admin_share_file_detail": (
                reverse("admin_share_file_detail", kwargs={"project_id": "project-1"}),
                views.admin_share_file_detail,
            ),
        }

        for route_name, (path, view_func) in expected_routes.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(path).func, view_func)


class ShareFileRegistryTests(SimpleTestCase):
    def test_existing_single_file_share_is_listed(self):
        with tempfile.TemporaryDirectory() as tmpdir, override_settings(CODEMARK_SHARECODE_DIR=tmpdir):
            month_dir = os.path.join(tmpdir, "202606")
            os.makedirs(month_dir)
            project_id = "abc_20260610123456"
            with open(os.path.join(month_dir, f"{project_id}.txt"), "w", encoding="utf-8") as share_file:
                share_file.write("__TEMPLATE__=sharecode\n")
                share_file.write("__LANG__=python\n")
                share_file.write("__THEME__=monokai\n")
                share_file.write("print('hello admin')\n")

            records = list_shared_code_records()

            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["project_id"], project_id)
            self.assertEqual(records[0]["text_file_count"], 1)
            self.assertIn("hello admin", records[0]["preview_text"])

    def test_multi_file_share_detail_includes_all_text_files(self):
        with tempfile.TemporaryDirectory() as tmpdir, override_settings(CODEMARK_SHARECODE_DIR=tmpdir):
            month_dir = os.path.join(tmpdir, "202606")
            os.makedirs(month_dir)
            project_id = "multi_20260610123500"
            with open(os.path.join(month_dir, f"{project_id}.txt"), "w", encoding="utf-8") as share_file:
                share_file.write("__TEMPLATE__=sharecode\n")
                share_file.write("__LANG__=python\n")
                share_file.write("__THEME__=monokai\n")
                share_file.write(f"{FILENAME_MARKER}main.py\n")
                share_file.write(f"{FILE_LANGUAGE_MARKER}python\n")
                share_file.write("print('main')\n")
                share_file.write(f"{FILENAME_MARKER}notes.md\n")
                share_file.write(f"{FILE_LANGUAGE_MARKER}markdown\n")
                share_file.write("# Notes\n")

            record = get_shared_code_record(project_id)

            self.assertIsNotNone(record)
            self.assertEqual(record["text_file_count"], 2)
            self.assertEqual([item["path"] for item in record["text_files"]], ["main.py", "notes.md"])
            self.assertIn(FILENAME_MARKER, record["stored_content"])


class AdminShareFileViewTests(TestCase):
    def test_share_file_admin_requires_staff_login(self):
        response = self.client.get(reverse("admin_share_files"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])

    def test_staff_user_can_view_share_file_admin(self):
        with tempfile.TemporaryDirectory() as tmpdir, override_settings(CODEMARK_SHARECODE_DIR=tmpdir):
            month_dir = os.path.join(tmpdir, "202606")
            os.makedirs(month_dir)
            with open(os.path.join(month_dir, "staff_20260610123600.txt"), "w", encoding="utf-8") as share_file:
                share_file.write("__TEMPLATE__=sharecode\n__LANG__=python\n__THEME__=monokai\nprint('staff')\n")

            User = get_user_model()
            user = User.objects.create_user(
                username="staff",
                password="test-password",
                is_staff=True,
                is_superuser=True,
            )
            client = Client()
            client.force_login(user)

            response = client.get(reverse("admin_share_files"))

            self.assertEqual(response.status_code, 200)
            self.assertContains(response, "staff_20260610123600")


class ShareUploadTests(TestCase):
    def test_large_image_asset_share_is_accepted_and_persisted(self):
        with tempfile.TemporaryDirectory() as tmpdir, override_settings(CODEMARK_SHARECODE_DIR=tmpdir):
            data_url = "data:image/png;base64," + ("A" * (3 * 1024 * 1024))
            payload = {
                "text_files": [
                    {
                        "path": "README.md",
                        "content": "# Image share\n",
                        "language": "markdown",
                    }
                ],
                "assets": [
                    {
                        "path": "images/example.png",
                        "mime_type": "image/png",
                        "size": 0,
                        "data_base64": data_url,
                    }
                ],
                "folders": ["images"],
                "active_file": "README.md",
                "theme": "monokai",
            }

            response = self.client.post(reverse("upload_code"), {
                "language": "markdown",
                "template": "sharecode",
                "theme": "monokai",
                "project_payload": json.dumps(payload),
            })

            self.assertEqual(response.status_code, 200)
            project_id = response.json()["project_id"]
            saved_asset_path = os.path.join(
                tmpdir,
                "assets",
                project_id,
                "images",
                "example.png",
            )
            self.assertTrue(os.path.exists(saved_asset_path))
