from django.test import SimpleTestCase
from django.urls import resolve, reverse

from . import views


class ArticleUrlPatternTests(SimpleTestCase):
    def test_article_routes_keep_existing_names_and_paths(self):
        expected_routes = {
            "index": (reverse("index"), views.index),
            "article": (reverse("article", kwargs={"filename": "demo.md"}), views.article),
        }

        for route_name, (path, view_func) in expected_routes.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(path).func, view_func)


class SiteNavigationTests(SimpleTestCase):
    def test_home_navigation_includes_public_page_links(self):
        response = self.client.get(reverse("index"))

        self.assertEqual(response.status_code, 200)
        expected_links = [
            "/#learning",
            reverse("editor"),
            reverse("cpp_editor"),
            reverse("algorithms"),
            reverse("blog_list"),
            reverse("sharecode"),
        ]
        html = response.content.decode()

        for href in expected_links:
            with self.subTest(href=href):
                self.assertIn(f'href="{href}"', html)

        self.assertIn(f'href="{reverse("cpp_editor")}" role="menuitem"', html)
        self.assertIn(f'<a class="quick-tile" href="{reverse("cpp_editor")}">', html)
        self.assertContains(response, "C++ 编辑器")
