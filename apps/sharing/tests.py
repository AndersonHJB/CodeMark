from django.test import SimpleTestCase
from django.urls import resolve, reverse

from . import views


class SharingUrlPatternTests(SimpleTestCase):
    def test_static_sharing_routes_keep_existing_names_and_paths(self):
        expected_routes = {
            "sharecode": (reverse("sharecode"), views.sharecode),
            "upload_code": (reverse("upload_code"), views.upload_code),
            "download_project_zip": (reverse("download_project_zip"), views.download_project_zip),
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
        }

        for route_name, (path, view_func) in expected_routes.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(path).func, view_func)
