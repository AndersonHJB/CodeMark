from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import resolve, reverse

from .models import ArticleSidebarItem
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


class SiteNavigationTests(TestCase):
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


class ArticleDirectoryTreeTests(TestCase):
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

    def test_markdown_title_is_used_as_default_sidebar_title(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏").mkdir()
            (root / "专栏" / "01-a.md").write_text(
                "---\ntitle: Markdown 标题\n---\n\n# 文档标题\n",
                encoding="utf-8",
            )

            tree = views.build_directory_tree(root)

        collection = views.get_article_collections(tree)[0]
        self.assertEqual(collection["tree"]["files"][0]["default_title"], "Markdown 标题")
        self.assertEqual(collection["tree"]["files"][0]["title"], "Markdown 标题")

    def test_sidebar_config_overrides_titles_and_sibling_order(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏").mkdir()
            (root / "专栏" / "01-a.md").write_text("---\ntitle: A\n---\n", encoding="utf-8")
            (root / "专栏" / "02-b.md").write_text("---\ntitle: B\n---\n", encoding="utf-8")

            ArticleSidebarItem.objects.create(
                path="专栏/01-a.md",
                parent_path="专栏",
                node_type=ArticleSidebarItem.NODE_FILE,
                title_override="自定义 A",
                sort_order=1,
            )
            ArticleSidebarItem.objects.create(
                path="专栏/02-b.md",
                parent_path="专栏",
                node_type=ArticleSidebarItem.NODE_FILE,
                sort_order=0,
            )

            tree = views.build_directory_tree(root, config_map=views.get_article_sidebar_config_map())

        collection_tree = views.get_article_collections(tree)[0]["tree"]
        self.assertEqual([item["path"] for item in collection_tree["files"]], ["专栏/02-b.md", "专栏/01-a.md"])
        self.assertEqual(collection_tree["files"][1]["title"], "自定义 A")

    def test_sidebar_config_can_reparent_article_to_another_folder(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏" / "第一章").mkdir(parents=True)
            (root / "专栏" / "第二章").mkdir()
            (root / "专栏" / "第一章" / "01-a.md").write_text("# a", encoding="utf-8")

            ArticleSidebarItem.objects.create(
                path="专栏/第一章/01-a.md",
                parent_path="专栏/第二章",
                node_type=ArticleSidebarItem.NODE_FILE,
                sort_order=0,
            )

            tree = views.build_directory_tree(root, config_map=views.get_article_sidebar_config_map())

        collection_tree = views.get_article_collections(tree)[0]["tree"]
        first_chapter = next(item for item in collection_tree["subdirs_list"] if item["path"] == "专栏/第一章")
        second_chapter = next(item for item in collection_tree["subdirs_list"] if item["path"] == "专栏/第二章")

        self.assertEqual(first_chapter["tree"]["files"], [])
        self.assertEqual([item["path"] for item in second_chapter["tree"]["files"]], ["专栏/第一章/01-a.md"])

    def test_sidebar_config_can_reparent_folder_to_another_folder(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏" / "第一章").mkdir(parents=True)
            (root / "专栏" / "第二章").mkdir()
            (root / "专栏" / "第一章" / "01-a.md").write_text("# a", encoding="utf-8")

            ArticleSidebarItem.objects.create(
                path="专栏/第一章",
                parent_path="专栏/第二章",
                node_type=ArticleSidebarItem.NODE_DIR,
                sort_order=0,
            )

            tree = views.build_directory_tree(root, config_map=views.get_article_sidebar_config_map())

        collection_tree = views.get_article_collections(tree)[0]["tree"]
        second_chapter = next(item for item in collection_tree["subdirs_list"] if item["path"] == "专栏/第二章")

        self.assertEqual([item["path"] for item in second_chapter["tree"]["subdirs_list"]], ["专栏/第一章"])
        self.assertEqual(second_chapter["article_count"], 1)

    def test_sidebar_config_can_reparent_article_under_article_with_multiple_levels(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏").mkdir()
            (root / "专栏" / "01-parent.md").write_text("# parent", encoding="utf-8")
            (root / "专栏" / "02-child.md").write_text("# child", encoding="utf-8")
            (root / "专栏" / "03-grandchild.md").write_text("# grandchild", encoding="utf-8")

            ArticleSidebarItem.objects.create(
                path="专栏/02-child.md",
                parent_path="专栏/01-parent.md",
                node_type=ArticleSidebarItem.NODE_FILE,
                sort_order=0,
            )
            ArticleSidebarItem.objects.create(
                path="专栏/03-grandchild.md",
                parent_path="专栏/02-child.md",
                node_type=ArticleSidebarItem.NODE_FILE,
                sort_order=0,
            )

            tree = views.build_directory_tree(root, config_map=views.get_article_sidebar_config_map())

        collection_tree = views.get_article_collections(tree)[0]["tree"]
        parent_article = next(item for item in collection_tree["files"] if item["path"] == "专栏/01-parent.md")
        child_article = parent_article["tree"]["files"][0]

        self.assertEqual(collection_tree["article_count"], 3)
        self.assertEqual([item["path"] for item in collection_tree["files"]], ["专栏/01-parent.md"])
        self.assertEqual(child_article["path"], "专栏/02-child.md")
        self.assertEqual(child_article["tree"]["files"][0]["path"], "专栏/03-grandchild.md")
        self.assertEqual(parent_article["article_count"], 3)

    def test_hidden_article_is_filtered_from_public_tree_but_kept_for_admin_tree(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏").mkdir()
            (root / "专栏" / "01-visible.md").write_text("# visible", encoding="utf-8")
            (root / "专栏" / "02-hidden.md").write_text("# hidden", encoding="utf-8")

            ArticleSidebarItem.objects.create(
                path="专栏/02-hidden.md",
                parent_path="专栏",
                node_type=ArticleSidebarItem.NODE_FILE,
                sort_order=1,
                is_hidden=True,
            )

            config_map = views.get_article_sidebar_config_map()
            admin_tree = views.build_directory_tree(root, config_map=config_map)
            public_tree = views.build_directory_tree(root, config_map=config_map, hide_hidden=True)

        admin_paths = views.flatten_directory_tree(admin_tree)
        collection_tree = views.get_article_collections(public_tree)[0]["tree"]

        self.assertIn("专栏/02-hidden.md", admin_paths)
        self.assertFalse(views.contains_sidebar_path(public_tree, "专栏/02-hidden.md"))
        self.assertEqual([item["path"] for item in collection_tree["files"]], ["专栏/01-visible.md"])
        self.assertEqual(collection_tree["article_count"], 1)

    def test_hidden_folder_filters_descendant_articles(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏" / "章节").mkdir(parents=True)
            (root / "专栏" / "章节" / "01-hidden-child.md").write_text("# hidden child", encoding="utf-8")
            (root / "专栏" / "02-visible.md").write_text("# visible", encoding="utf-8")

            ArticleSidebarItem.objects.create(
                path="专栏/章节",
                parent_path="专栏",
                node_type=ArticleSidebarItem.NODE_DIR,
                sort_order=0,
                is_hidden=True,
            )

            public_tree = views.build_directory_tree(
                root,
                config_map=views.get_article_sidebar_config_map(),
                hide_hidden=True,
            )

        collection_tree = views.get_article_collections(public_tree)[0]["tree"]

        self.assertFalse(views.contains_sidebar_path(public_tree, "专栏/章节"))
        self.assertFalse(views.contains_sidebar_path(public_tree, "专栏/章节/01-hidden-child.md"))
        self.assertEqual([item["path"] for item in collection_tree["files"]], ["专栏/02-visible.md"])
        self.assertEqual(collection_tree["article_count"], 1)

    def test_save_sidebar_payload_persists_hidden_state(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏").mkdir()
            (root / "专栏" / "01-a.md").write_text("# a", encoding="utf-8")

            generated_tree = views.build_directory_tree(root)
            valid_items = views.flatten_directory_tree(generated_tree)
            views.save_article_sidebar_payload([{
                "path": "专栏/01-a.md",
                "node_type": ArticleSidebarItem.NODE_FILE,
                "parent_path": "专栏",
                "sort_order": 0,
                "title": "a",
                "is_hidden": True,
            }], valid_items)

        self.assertTrue(ArticleSidebarItem.objects.get(path="专栏/01-a.md").is_hidden)

    def test_sidebar_parent_validation_rejects_article_cycle(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏").mkdir()
            (root / "专栏" / "01-a.md").write_text("# a", encoding="utf-8")
            (root / "专栏" / "02-b.md").write_text("# b", encoding="utf-8")

            generated_tree = views.build_directory_tree(root)
            valid_items = views.flatten_directory_tree(generated_tree)
            views.save_article_sidebar_payload([
                {
                    "path": "专栏/01-a.md",
                    "node_type": ArticleSidebarItem.NODE_FILE,
                    "parent_path": "专栏/02-b.md",
                    "sort_order": 0,
                    "title": "a",
                },
                {
                    "path": "专栏/02-b.md",
                    "node_type": ArticleSidebarItem.NODE_FILE,
                    "parent_path": "专栏/01-a.md",
                    "sort_order": 0,
                    "title": "b",
                },
            ], valid_items)

        self.assertEqual(ArticleSidebarItem.objects.get(path="专栏/01-a.md").parent_path, "专栏")
        self.assertEqual(ArticleSidebarItem.objects.get(path="专栏/02-b.md").parent_path, "专栏/01-a.md")

    def test_sidebar_parent_validation_rejects_folder_cycle(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏" / "第一章" / "子章").mkdir(parents=True)
            (root / "专栏" / "第一章" / "子章" / "01-a.md").write_text("# a", encoding="utf-8")

            generated_tree = views.build_directory_tree(root)
            valid_items = views.flatten_directory_tree(generated_tree)
            views.save_article_sidebar_payload([{
                "path": "专栏/第一章",
                "node_type": ArticleSidebarItem.NODE_DIR,
                "parent_path": "专栏/第一章/子章",
                "sort_order": 0,
                "title": "第一章",
            }], valid_items)

        self.assertEqual(ArticleSidebarItem.objects.get(path="专栏/第一章").parent_path, "专栏")

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

    def test_hidden_article_url_returns_404(self):
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "专栏").mkdir()
            (root / "专栏" / "01-hidden.md").write_text("# hidden", encoding="utf-8")

            ArticleSidebarItem.objects.create(
                path="专栏/01-hidden.md",
                parent_path="专栏",
                node_type=ArticleSidebarItem.NODE_FILE,
                sort_order=0,
                is_hidden=True,
            )

            with override_settings(CODEMARK_ARTICLES_DIR=root):
                response = self.client.get(reverse("article", kwargs={"filename": "专栏/01-hidden.md"}))

        self.assertEqual(response.status_code, 404)
