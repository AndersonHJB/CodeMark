from django.test import SimpleTestCase
from django.urls import resolve, reverse

from . import views


class UrlPatternTests(SimpleTestCase):
    def test_existing_route_names_resolve_to_same_views(self):
        expected_views = {
            "index": views.index,
            "editor": views.editor,
            "sharecode": views.sharecode,
            "upload_code": views.upload_code,
            "download_project_zip": views.download_project_zip,
        }

        for route_name, view_func in expected_views.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(reverse(route_name)).func, view_func)

    def test_dynamic_routes_keep_existing_names_and_paths(self):
        dynamic_routes = {
            "article": ({"filename": "demo.md"}, views.article),
            "get_shared_asset": (
                {"project_id": "project-1", "asset_path": "images/logo.png"},
                views.get_shared_asset,
            ),
            "show_shared_code": ({"project_id": "project-1"}, views.show_shared_code),
        }

        for route_name, (kwargs, view_func) in dynamic_routes.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(reverse(route_name, kwargs=kwargs)).func, view_func)
