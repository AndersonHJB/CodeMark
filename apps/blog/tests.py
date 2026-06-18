import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import resolve, reverse
from django.utils import timezone

from . import views
from .models import BlogBookmark, BlogComment, BlogPost, BlogReaction, BlogTag


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
            "blog_write": (reverse("blog_write"), views.blog_write),
            "blog_mine": (reverse("blog_mine"), views.blog_mine),
            "blog_detail": (reverse("blog_detail", kwargs={"slug": "demo"}), views.blog_detail),
            "blog_upload_image": (reverse("blog_upload_image"), views.blog_upload_image),
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
        self.assertContains(detail_response, f'data-comment-reply-form="{parent.id}"', html=False)

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
