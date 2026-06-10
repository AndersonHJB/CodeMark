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
