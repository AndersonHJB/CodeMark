import json
import os
import tempfile

from django.contrib.auth import get_user_model
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import resolve, reverse

from apps.common.project_payload import ASSET_MARKER, FILENAME_MARKER, FILE_LANGUAGE_MARKER

from . import views
from .models import SharedFileAdminEntry
from .share_files import (
    OWNER_ID_MARKER,
    classify_asset_preview_type,
    get_shared_code_record,
    list_shared_code_records,
)


class SharingUrlPatternTests(SimpleTestCase):
    def test_static_sharing_routes_keep_existing_names_and_paths(self):
        expected_routes = {
            "sharecode": (reverse("sharecode"), views.sharecode),
            "upload_code": (reverse("upload_code"), views.upload_code),
            "download_project_zip": (reverse("download_project_zip"), views.download_project_zip),
            "admin_share_files": (reverse("admin_share_files"), views.admin_share_files),
            "account_share_links": (reverse("account_share_links"), views.account_share_links),
        }

        for route_name, (path, view_func) in expected_routes.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(path).func, view_func)

    def test_sharecode_page_includes_cpp_run_entries(self):
        response = self.client.get(reverse("sharecode"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="toolbar-btn run cpp-run-btn"', html=False)
        self.assertContains(response, 'id="mobile-cpp-run"', html=False)
        self.assertContains(response, 'onclick="goCppRunPage()"', count=2, html=False)

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
            "delete_account_share_link": (
                reverse("delete_account_share_link", kwargs={"project_id": "project-1"}),
                views.delete_account_share_link,
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

    def test_asset_preview_type_uses_mime_and_extension_fallback(self):
        cases = [
            ({"path": "images/photo.bin", "mime_type": "image/jpeg"}, "image"),
            ({"path": "movies/clip.mp4", "mime_type": "application/octet-stream"}, "video"),
            ({"path": "sounds/voice.mp3", "mime_type": ""}, "audio"),
            ({"path": "downloads/archive.zip", "mime_type": "application/zip"}, "file"),
        ]

        for asset, expected_type in cases:
            with self.subTest(asset=asset):
                self.assertEqual(classify_asset_preview_type(asset), expected_type)

    def test_owner_metadata_is_parsed_and_can_filter_records(self):
        with tempfile.TemporaryDirectory() as tmpdir, override_settings(CODEMARK_SHARECODE_DIR=tmpdir):
            month_dir = os.path.join(tmpdir, "202606")
            os.makedirs(month_dir)
            own_project_id = "own_20260610123800"
            other_project_id = "other_20260610123900"
            with open(os.path.join(month_dir, f"{own_project_id}.txt"), "w", encoding="utf-8") as share_file:
                share_file.write("__TEMPLATE__=sharecode\n")
                share_file.write("__LANG__=python\n")
                share_file.write("__THEME__=monokai\n")
                share_file.write(f"{OWNER_ID_MARKER}7\n")
                share_file.write("print('own')\n")
            with open(os.path.join(month_dir, f"{other_project_id}.txt"), "w", encoding="utf-8") as share_file:
                share_file.write("__TEMPLATE__=sharecode\n")
                share_file.write("__LANG__=python\n")
                share_file.write("__THEME__=monokai\n")
                share_file.write(f"{OWNER_ID_MARKER}9\n")
                share_file.write("print('other')\n")

            records = list_shared_code_records(owner_user_id=7)

            self.assertEqual([record["project_id"] for record in records], [own_project_id])
            self.assertEqual(records[0]["owner_user_id"], 7)


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

    def test_detail_page_renders_media_asset_previews(self):
        with tempfile.TemporaryDirectory() as tmpdir, override_settings(CODEMARK_SHARECODE_DIR=tmpdir):
            month_dir = os.path.join(tmpdir, "202606")
            os.makedirs(month_dir)
            project_id = "media_20260610123700"
            with open(os.path.join(month_dir, f"{project_id}.txt"), "w", encoding="utf-8") as share_file:
                share_file.write("__TEMPLATE__=sharecode\n")
                share_file.write("__LANG__=python\n")
                share_file.write("__THEME__=monokai\n")
                share_file.write(f"{ASSET_MARKER}images/photo.jpg|images/photo.jpg|image/jpeg|12\n")
                share_file.write(f"{ASSET_MARKER}videos/demo.mp4|videos/demo.mp4|video/mp4|34\n")
                share_file.write(f"{ASSET_MARKER}audio/demo.mp3|audio/demo.mp3|audio/mpeg|56\n")

            User = get_user_model()
            user = User.objects.create_user(
                username="media-staff",
                password="test-password",
                is_staff=True,
                is_superuser=True,
            )
            client = Client()
            client.force_login(user)

            response = client.get(reverse("admin_share_file_detail", kwargs={"project_id": project_id}))

            self.assertEqual(response.status_code, 200)
            self.assertContains(response, "<img", html=False)
            self.assertContains(response, "<video", html=False)
            self.assertContains(response, "<audio", html=False)
            self.assertContains(response, "images/photo.jpg")

    def test_admin_index_has_share_file_entry(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="admin",
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        client = Client()
        client.force_login(user)

        response = client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "分享文件后台")
        self.assertContains(response, reverse("admin:sharing_sharedfileadminentry_changelist"))

    def test_admin_share_file_entry_redirects_to_custom_backend(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="admin2",
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        client = Client()
        client.force_login(user)

        response = client.get(reverse("admin:sharing_sharedfileadminentry_changelist"))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], reverse("admin_share_files"))


class ShareUploadTests(TestCase):
    def test_account_share_links_page_prompts_guest(self):
        response = self.client.get(reverse("account_share_links"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "登录后管理分享链接")
        self.assertContains(response, "data-account-open-login", html=False)

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

    def test_authenticated_upload_is_listed_and_deleted_from_account_page(self):
        with tempfile.TemporaryDirectory() as tmpdir, override_settings(CODEMARK_SHARECODE_DIR=tmpdir):
            User = get_user_model()
            owner = User.objects.create_user(
                username="share-owner",
                email="share-owner@example.com",
                password="test-password",
            )
            other_user = User.objects.create_user(
                username="share-other",
                email="share-other@example.com",
                password="test-password",
            )
            self.client.force_login(owner)

            response = self.client.post(reverse("upload_code"), {
                "code": "print('owned share')\n",
                "language": "python",
                "template": "editor",
                "theme": "monokai",
            })

            self.assertEqual(response.status_code, 200)
            project_id = response.json()["project_id"]
            record = get_shared_code_record(project_id)
            self.assertIsNotNone(record)
            self.assertEqual(record["owner_user_id"], owner.pk)

            month_dir = os.path.join(tmpdir, "202606")
            os.makedirs(month_dir, exist_ok=True)
            other_project_id = "other_20260610124000"
            with open(os.path.join(month_dir, f"{other_project_id}.txt"), "w", encoding="utf-8") as share_file:
                share_file.write("__TEMPLATE__=sharecode\n")
                share_file.write("__LANG__=python\n")
                share_file.write("__THEME__=monokai\n")
                share_file.write(f"{OWNER_ID_MARKER}{other_user.pk}\n")
                share_file.write("print('other share')\n")

            page_response = self.client.get(reverse("account_share_links"))

            self.assertEqual(page_response.status_code, 200)
            self.assertContains(page_response, project_id)
            self.assertContains(page_response, "owned share")
            self.assertNotContains(page_response, other_project_id)
            self.assertNotContains(page_response, "other share")

            delete_response = self.client.post(
                reverse("delete_account_share_link", kwargs={"project_id": project_id}),
                follow=True,
            )

            self.assertEqual(delete_response.status_code, 200)
            self.assertContains(delete_response, "分享链接已删除")
            self.assertIsNone(get_shared_code_record(project_id))
