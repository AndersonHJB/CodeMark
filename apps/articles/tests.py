from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase, override_settings
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


class ArticleDirectoryTreeTests(SimpleTestCase):
    def test_top_level_directories_are_collections_with_own_tree(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏1" / "章节").mkdir(parents=True)
            (root / "专栏10").mkdir()
            (root / "专栏1" / "00-start.md").write_text("# start", encoding="utf-8")
            (root / "专栏1" / "章节" / "01-a.md").write_text("# a", encoding="utf-8")
            (root / "专栏10" / "01-other.md").write_text("# other", encoding="utf-8")

            tree = views.build_directory_tree(root, current_file="专栏1/章节/01-a.md")
            collections = views.get_article_collections(tree)
            current_collection = views.get_current_collection(tree, "专栏1/章节/01-a.md")

        self.assertEqual(tree["article_count"], 3)
        self.assertEqual([collection["dirname"] for collection in collections], ["专栏1", "专栏10"])
        self.assertTrue(collections[0]["is_open"])
        self.assertFalse(collections[1]["is_open"])
        self.assertEqual(current_collection["dirname"], "专栏1")
        self.assertEqual(current_collection["article_count"], 2)
        self.assertEqual(current_collection["first_article_path"], "专栏1/00-start.md")

    def test_article_sidebar_marks_active_file_and_open_ancestors(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏" / "章节" / "子章节").mkdir(parents=True)
            (root / "专栏" / "00-start.md").write_text("# start", encoding="utf-8")
            (root / "专栏" / "章节" / "子章节" / "01-deep.md").write_text("# deep", encoding="utf-8")

            with override_settings(CODEMARK_ARTICLES_DIR=root):
                response = self.client.get(reverse("article", kwargs={"filename": "专栏/章节/子章节/01-deep.md"}))

        html = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertIn('data-article-path="专栏/章节/子章节/01-deep.md"', html)
        self.assertIn('aria-current="page"', html)
        self.assertRegex(html, r'data-folder-path="专栏/章节"\s+aria-expanded="true"')
        self.assertRegex(html, r'data-folder-path="专栏/章节/子章节"\s+aria-expanded="true"')
