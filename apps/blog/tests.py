import tempfile
import zipfile
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import resolve, reverse
from django.utils import timezone

from apps.accounts.models import UserProfile

from . import views
from .exporters import build_blog_posts_markdown_archive
from .models import BlogArticleApiAccess, BlogBookmark, BlogComment, BlogPost, BlogReaction, BlogTag, BlogVipPage


TINY_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def tiny_png_upload(name="paste.png"):
    return SimpleUploadedFile(name, TINY_PNG_BYTES, content_type="image/png")


class BlogUrlPatternTests(SimpleTestCase):
    def test_blog_routes_resolve_to_views(self):
        expected_routes = {
            "blog_list": (reverse("blog_list"), views.blog_list),
            "blog_vip_guide": (reverse("blog_vip_guide"), views.blog_vip_guide),
            "blog_vip_page": (reverse("blog_vip_page", kwargs={"slug": "api"}), views.blog_vip_guide),
            "blog_write": (reverse("blog_write"), views.blog_write),
            "blog_mine": (reverse("blog_mine"), views.blog_mine),
            "blog_user_home": (reverse("blog_user_home", kwargs={"author_username": "demo"}), views.blog_user_home),
            "blog_detail": (reverse("blog_detail", kwargs={"slug": "demo"}), views.blog_detail),
            "blog_upload_image": (reverse("blog_upload_image"), views.blog_upload_image),
            "blog_article_api": (
                reverse("blog_article_api", kwargs={"slug": "demo"}),
                views.blog_article_api,
            ),
            "blog_download_markdown": (
                reverse("blog_download_markdown", kwargs={"slug": "demo"}),
                views.blog_download_markdown,
            ),
            "blog_toggle_comment_pin": (
                reverse("blog_toggle_comment_pin", kwargs={"slug": "demo", "comment_id": 1}),
                views.blog_toggle_comment_pin,
            ),
        }

        for route_name, (path, view_func) in expected_routes.items():
            with self.subTest(route_name=route_name):
                self.assertIs(resolve(path).func, view_func)


class BlogPostFlowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="blogger",
            email="blogger@example.com",
            password="test-password",
            first_name="博客作者",
        )
        self.client.force_login(self.user)

    def test_publish_markdown_post_renders_and_sanitizes_html(self):
        response = self.client.post(
            reverse("blog_write"),
            {
                "title": "Django Markdown 发布测试",
                "summary": "测试摘要",
                "category": "Django",
                "tags_text": "Django，Markdown",
                "content_format": BlogPost.FORMAT_MARKDOWN,
                "content": "# 标题\n\n<script>alert(1)</script>\n\n```python\nprint('ok')\n```",
                "allow_comments": "on",
                "action": "publish",
            },
        )

        post = BlogPost.objects.get(title="Django Markdown 发布测试")
        self.assertRedirects(response, post.get_absolute_url())
        self.assertEqual(post.status, BlogPost.STATUS_PUBLISHED)
        self.assertIsNotNone(post.published_at)
        self.assertEqual(set(post.tags.values_list("name", flat=True)), {"Django", "Markdown"})

        detail_response = self.client.get(post.get_absolute_url())
        self.assertEqual(detail_response.status_code, 200)
        self.assertContains(detail_response, "标题")
        self.assertContains(detail_response, "blog-post-meta-band", html=False)
        self.assertContains(detail_response, "blog-ref-chip-blue", html=False)
        self.assertContains(detail_response, "blog-ref-chip-tag", html=False)
        self.assertContains(detail_response, "原创")
        self.assertContains(detail_response, "约 ")
        self.assertContains(detail_response, "data-like-count", html=False)
        self.assertContains(detail_response, reverse("blog_article_api", kwargs={"slug": post.slug}))
        self.assertContains(detail_response, 'data-copy-link="http://testserver', html=False)
        self.assertContains(detail_response, 'class="language-python"', html=False)
        self.assertNotContains(detail_response, "<script>alert", html=False)

    def test_draft_post_is_only_visible_to_author(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="只给作者看的草稿",
            content="这是一篇没有发布的草稿正文。",
            status=BlogPost.STATUS_DRAFT,
        )
        self.client.logout()

        public_detail = self.client.get(post.get_absolute_url())
        public_list = self.client.get(reverse("blog_list"))

        self.assertEqual(public_detail.status_code, 404)
        self.assertNotContains(public_list, "只给作者看的草稿")

        self.client.force_login(self.user)
        author_detail = self.client.get(post.get_absolute_url())
        self.assertEqual(author_detail.status_code, 200)
        self.assertContains(author_detail, "只给作者看的草稿")

    def test_image_upload_requires_login_and_accepts_valid_image(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            guest = Client()
            guest_response = guest.post(reverse("blog_upload_image"), {"image": tiny_png_upload()})
            self.assertEqual(guest_response.status_code, 401)

            response = self.client.post(reverse("blog_upload_image"), {"image": tiny_png_upload("screen.png")})

            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertEqual(payload["ok"], True)
            self.assertIn("/media/blog/images/", payload["url"])
            self.assertIn("![screen.png]", payload["markdown"])
            self.assertIn("<img", payload["html"])

    def test_staff_can_download_single_post_from_detail_page(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="管理员可下载文章",
            content="这是一篇可以被管理员单独下载的正文。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        download_url = reverse("blog_download_markdown", kwargs={"slug": post.slug})

        author_detail = self.client.get(post.get_absolute_url())
        author_download = self.client.get(download_url)
        self.assertNotContains(author_detail, download_url)
        self.assertEqual(author_download.status_code, 404)

        staff = get_user_model().objects.create_user(
            username="staff",
            email="staff@example.com",
            password="test-password",
            is_staff=True,
        )
        staff_client = Client()
        staff_client.force_login(staff)

        staff_detail = staff_client.get(post.get_absolute_url())
        staff_download = staff_client.get(download_url)
        archive_bytes = b"".join(staff_download.streaming_content)

        self.assertContains(staff_detail, download_url)
        self.assertEqual(staff_download.status_code, 200)
        self.assertEqual(staff_download["Content-Type"], "application/zip")
        with zipfile.ZipFile(BytesIO(archive_bytes)) as zip_file:
            self.assertTrue(any(name.endswith(".md") for name in zip_file.namelist()))

    def test_article_api_requires_login_and_vip(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="仅 VIP 可请求数据的文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        api_url = reverse("blog_article_api", kwargs={"slug": post.slug})

        self.client.logout()
        guest_response = self.client.get(api_url)
        self.assertEqual(guest_response.status_code, 401)

        self.client.force_login(self.user)
        UserProfile.objects.update_or_create(user=self.user, defaults={"is_vip": False})
        denied_response = self.client.get(api_url)

        self.assertEqual(denied_response.status_code, 403)
        self.assertFalse(BlogArticleApiAccess.objects.exists())

    def test_vip_guide_requires_vip_and_renders_multi_page_content(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="VIP 教程示例文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        guide_url = reverse("blog_vip_guide")
        api_guide_url = reverse("blog_vip_page", kwargs={"slug": "api"})
        api_url = reverse("blog_article_api", kwargs={"slug": post.slug})

        denied_response = self.client.get(guide_url)
        self.assertEqual(denied_response.status_code, 403)

        UserProfile.objects.update_or_create(user=self.user, defaults={"is_vip": True})
        guide_response = self.client.get(guide_url)
        api_guide_response = self.client.get(api_guide_url)
        list_response = self.client.get(reverse("blog_list"))
        session_cookie = self.client.cookies[settings.SESSION_COOKIE_NAME].value

        self.assertEqual(guide_response.status_code, 200)
        self.assertContains(guide_response, "会员说明")
        self.assertContains(guide_response, "API 教程")
        self.assertContains(guide_response, "使用规范")
        self.assertContains(guide_response, "VIP 访问已启用")
        self.assertContains(guide_response, api_guide_url)
        self.assertEqual(api_guide_response.status_code, 200)
        self.assertContains(api_guide_response, "账号权限")
        self.assertContains(api_guide_response, "请求示例")
        self.assertContains(api_guide_response, "获取 Cookies")
        self.assertContains(api_guide_response, "复制 Cookies")
        self.assertContains(api_guide_response, "sessionid")
        self.assertContains(api_guide_response, f"{settings.SESSION_COOKIE_NAME}={session_cookie}", html=False)
        self.assertContains(api_guide_response, "language-javascript")
        self.assertContains(api_guide_response, "language-python")
        self.assertContains(api_guide_response, "data-blog-static-code", html=False)
        self.assertContains(api_guide_response, "返回数据")
        self.assertContains(api_guide_response, f"http://testserver{api_url}")
        self.assertContains(api_guide_response, 'data-copy-link="http://testserver', html=False)
        self.assertEqual(BlogVipPage.objects.filter(status=BlogVipPage.STATUS_PUBLISHED).count(), 3)
        self.assertContains(list_response, guide_url)

    def test_vip_article_api_returns_full_payload_and_rate_limits_per_article(self):
        UserProfile.objects.update_or_create(user=self.user, defaults={"is_vip": True})
        tag = BlogTag.objects.create(name="API")
        post = BlogPost.objects.create(
            author=self.user,
            title="可请求 API 数据的文章",
            summary="API 摘要",
            content="# API 正文\n\n这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
            category="数据",
            view_count=8,
        )
        post.tags.add(tag)
        BlogReaction.objects.create(post=post, user=self.user)
        BlogBookmark.objects.create(post=post, user=self.user)
        comment = BlogComment.objects.create(post=post, author=self.user, content="主评论")
        BlogComment.objects.create(post=post, parent=comment, author=self.user, content="评论回复")
        api_url = reverse("blog_article_api", kwargs={"slug": post.slug})

        first_response = self.client.get(api_url)
        second_response = self.client.get(api_url)
        limited_response = self.client.get(api_url)

        self.assertEqual(first_response.status_code, 200)
        payload = first_response.json()
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["article"]["title"], post.title)
        self.assertEqual(payload["article"]["author"]["username"], self.user.username)
        self.assertEqual(payload["article"]["summary"], "API 摘要")
        self.assertEqual(payload["article"]["category"], "数据")
        self.assertEqual(payload["article"]["tags"][0]["name"], "API")
        self.assertIn("API 正文", payload["article"]["content"])
        self.assertIn("<h1", payload["article"]["content_html"])
        self.assertEqual(payload["article"]["stats"]["views"], 8)
        self.assertEqual(payload["article"]["stats"]["api_requests"], 1)
        self.assertEqual(payload["article"]["stats"]["likes"], 1)
        self.assertEqual(payload["article"]["stats"]["bookmarks"], 1)
        self.assertEqual(payload["article"]["stats"]["comments"], 2)
        self.assertEqual(len(payload["article"]["comments"]), 2)
        self.assertEqual(payload["usage"]["limit"], 2)
        self.assertEqual(payload["usage"]["used"], 1)
        self.assertEqual(payload["usage"]["remaining"], 1)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.json()["usage"]["remaining"], 0)
        self.assertEqual(limited_response.status_code, 429)
        self.assertEqual(BlogArticleApiAccess.objects.get(user=self.user, post=post).request_count, 2)
        post.refresh_from_db()
        self.assertEqual(post.api_request_count, 2)

    def test_staff_article_api_bypasses_rate_limit(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="管理员不限频 API 文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        staff = get_user_model().objects.create_user(
            username="api-staff",
            email="api-staff@example.com",
            password="test-password",
            is_staff=True,
        )
        staff_client = Client()
        staff_client.force_login(staff)
        api_url = reverse("blog_article_api", kwargs={"slug": post.slug})

        responses = [staff_client.get(api_url) for _ in range(3)]

        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(responses[-1].json()["usage"]["limited"], False)
        self.assertFalse(BlogArticleApiAccess.objects.filter(user=staff, post=post).exists())
        post.refresh_from_db()
        self.assertEqual(post.api_request_count, 3)

    def test_reaction_and_bookmark_toggle(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="可点赞收藏的文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
        )

        like_response = self.client.post(reverse("blog_toggle_reaction", kwargs={"slug": post.slug}))
        bookmark_response = self.client.post(reverse("blog_toggle_bookmark", kwargs={"slug": post.slug}))

        self.assertEqual(like_response.json()["active"], True)
        self.assertEqual(bookmark_response.json()["active"], True)
        self.assertTrue(BlogReaction.objects.filter(post=post, user=self.user).exists())
        self.assertTrue(BlogBookmark.objects.filter(post=post, user=self.user).exists())

        unlike_response = self.client.post(reverse("blog_toggle_reaction", kwargs={"slug": post.slug}))
        unbookmark_response = self.client.post(reverse("blog_toggle_bookmark", kwargs={"slug": post.slug}))

        self.assertEqual(unlike_response.json()["active"], False)
        self.assertEqual(unbookmark_response.json()["active"], False)
        self.assertFalse(BlogReaction.objects.filter(post=post, user=self.user).exists())
        self.assertFalse(BlogBookmark.objects.filter(post=post, user=self.user).exists())

    def test_tag_route_filters_published_posts(self):
        tag = BlogTag.objects.create(name="Python")
        published = BlogPost.objects.create(
            author=self.user,
            title="Python 发布文章",
            content="这是一篇 Python 文章正文。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        other = BlogPost.objects.create(
            author=self.user,
            title="Django 发布文章",
            content="这是一篇 Django 文章正文。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        published.tags.add(tag)

        response = self.client.get(reverse("blog_tag", kwargs={"tag_slug": tag.slug}))

        self.assertIn(published, list(response.context["posts"]))
        self.assertNotIn(other, list(response.context["posts"]))

    def test_comment_reply_threads_render_on_detail_page(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="支持评论回复的文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        parent = BlogComment.objects.create(post=post, author=self.user, content="主评论")

        response = self.client.post(
            reverse("blog_add_comment", kwargs={"slug": post.slug}),
            {"parent_id": str(parent.id), "content": "这是一条回复"},
        )

        reply = BlogComment.objects.get(parent=parent)
        self.assertRedirects(response, f"{post.get_absolute_url()}#comment-{reply.id}")
        detail_response = self.client.get(post.get_absolute_url())
        self.assertContains(detail_response, "主评论")
        self.assertContains(detail_response, "这是一条回复")
        self.assertContains(detail_response, f'hidden data-comment-reply-form="{parent.id}"', html=False)

    def test_user_home_page_has_shareable_profile_link_and_public_posts(self):
        published = BlogPost.objects.create(
            author=self.user,
            title="主页可见文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
            category="Claude",
        )
        hidden = BlogPost.objects.create(
            author=self.user,
            title="主页不可见草稿",
            content="这是一篇草稿正文内容。",
            status=BlogPost.STATUS_DRAFT,
        )
        tag = BlogTag.objects.create(name="主页标签")
        published.tags.add(tag)

        response = self.client.get(reverse("blog_user_home", kwargs={"author_username": self.user.username}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "博客作者")
        self.assertContains(response, reverse("blog_user_home", kwargs={"author_username": self.user.username}))
        self.assertContains(response, 'data-copy-link=', html=False)
        self.assertContains(response, "Claude")
        self.assertContains(response, "#主页标签")
        self.assertContains(response, published.title)
        self.assertNotContains(response, hidden.title)

    def test_only_author_can_pin_top_level_comments_up_to_ten(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="支持置顶评论的文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        outsider = get_user_model().objects.create_user(
            username="outsider",
            email="outsider@example.com",
            password="test-password",
        )
        normal_comment = BlogComment.objects.create(post=post, author=outsider, content="值得置顶的评论")
        reply = BlogComment.objects.create(post=post, parent=normal_comment, author=self.user, content="回复不能置顶")

        outsider_client = Client()
        outsider_client.force_login(outsider)
        outsider_response = outsider_client.post(
            reverse("blog_toggle_comment_pin", kwargs={"slug": post.slug, "comment_id": normal_comment.id})
        )
        self.assertEqual(outsider_response.status_code, 404)

        reply_response = self.client.post(
            reverse("blog_toggle_comment_pin", kwargs={"slug": post.slug, "comment_id": reply.id})
        )
        reply.refresh_from_db()
        self.assertRedirects(reply_response, f"{post.get_absolute_url()}#comment-{reply.id}")
        self.assertFalse(reply.is_pinned)

        pin_response = self.client.post(
            reverse("blog_toggle_comment_pin", kwargs={"slug": post.slug, "comment_id": normal_comment.id})
        )
        normal_comment.refresh_from_db()
        self.assertRedirects(pin_response, f"{post.get_absolute_url()}#comment-{normal_comment.id}")
        self.assertTrue(normal_comment.is_pinned)
        self.assertIsNotNone(normal_comment.pinned_at)

        unpin_response = self.client.post(
            reverse("blog_toggle_comment_pin", kwargs={"slug": post.slug, "comment_id": normal_comment.id})
        )
        normal_comment.refresh_from_db()
        self.assertRedirects(unpin_response, f"{post.get_absolute_url()}#comment-{normal_comment.id}")
        self.assertFalse(normal_comment.is_pinned)
        self.assertIsNone(normal_comment.pinned_at)

    def test_comment_pin_limit_is_ten(self):
        post = BlogPost.objects.create(
            author=self.user,
            title="置顶数量限制文章",
            content="这是一篇已经发布的正文内容。",
            status=BlogPost.STATUS_PUBLISHED,
        )
        pinned_at = timezone.now()
        for index in range(10):
            BlogComment.objects.create(
                post=post,
                author=self.user,
                content=f"已置顶评论 {index}",
                is_pinned=True,
                pinned_at=pinned_at,
            )
        eleventh = BlogComment.objects.create(post=post, author=self.user, content="第十一条评论")

        response = self.client.post(
            reverse("blog_toggle_comment_pin", kwargs={"slug": post.slug, "comment_id": eleventh.id})
        )

        eleventh.refresh_from_db()
        self.assertRedirects(response, f"{post.get_absolute_url()}#comments")
        self.assertFalse(eleventh.is_pinned)
        self.assertEqual(post.comments.filter(is_pinned=True).count(), 10)


class BlogMarkdownExportTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="writer",
            email="writer@example.com",
            password="test-password",
        )

    def test_markdown_export_rewrites_media_references_and_packages_assets(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            self._write_media_file(media_root, "blog/images/2026/06/5d5c1d1f462db70663df2688051236fc.jpg", b"image")
            self._write_media_file(media_root, "blog/audio/2026/06/talk.mp3", b"audio")
            self._write_media_file(media_root, "blog/covers/2026/06/cover.jpg", b"cover")
            post = BlogPost.objects.create(
                author=self.user,
                title="Sub Agents Concepts and Benefits",
                content=(
                    "正文\n\n"
                    "![old alt](/media/blog/images/2026/06/5d5c1d1f462db70663df2688051236fc.jpg)\n\n"
                    "[音频](/media/blog/audio/2026/06/talk.mp3)"
                ),
                status=BlogPost.STATUS_PUBLISHED,
            )
            post.cover_image.name = "blog/covers/2026/06/cover.jpg"
            post.save(update_fields=["cover_image"])

            archive = build_blog_posts_markdown_archive(BlogPost.objects.filter(pk=post.pk))

            with zipfile.ZipFile(archive) as zip_file:
                names = set(zip_file.namelist())
                markdown = zip_file.read("00-sub-agents-concepts-and-benefits.md").decode("utf-8")

            self.assertIn("00-sub-agents-concepts-and-benefits.assets/", names)
            self.assertIn("00-sub-agents-concepts-and-benefits.assets/5d5c1d1f462db70663df2688051236fc.jpg", names)
            self.assertIn("00-sub-agents-concepts-and-benefits.assets/talk.mp3", names)
            self.assertIn("00-sub-agents-concepts-and-benefits.assets/cover.jpg", names)
            self.assertIn(
                "![](./00-sub-agents-concepts-and-benefits.assets/5d5c1d1f462db70663df2688051236fc.jpg)",
                markdown,
            )
            self.assertIn("[音频](./00-sub-agents-concepts-and-benefits.assets/talk.mp3)", markdown)
            self.assertIn("![](./00-sub-agents-concepts-and-benefits.assets/cover.jpg)", markdown)

    def test_rich_text_export_converts_image_tags_to_local_markdown_assets(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            self._write_media_file(media_root, "blog/images/2026/06/rich-image.png", TINY_PNG_BYTES)
            post = BlogPost.objects.create(
                author=self.user,
                title="Rich Text Export",
                content='<p>富文本正文</p><img src="/media/blog/images/2026/06/rich-image.png" alt="截图">',
                content_format=BlogPost.FORMAT_RICH_TEXT,
                status=BlogPost.STATUS_PUBLISHED,
            )

            archive = build_blog_posts_markdown_archive([post])

            with zipfile.ZipFile(archive) as zip_file:
                names = set(zip_file.namelist())
                markdown = zip_file.read("00-rich-text-export.md").decode("utf-8")

            self.assertIn("00-rich-text-export.assets/rich-image.png", names)
            self.assertIn("富文本正文", markdown)
            self.assertIn("![](./00-rich-text-export.assets/rich-image.png)", markdown)

    def _write_media_file(self, media_root, relative_path, content):
        path = Path(media_root) / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
