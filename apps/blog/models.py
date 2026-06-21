import math
import secrets
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.html import strip_tags
from django.utils.text import Truncator, slugify


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _safe_image_extension(filename):
    extension = Path(filename or "").suffix.lower()
    return extension if extension in IMAGE_EXTENSIONS else ".jpg"


def blog_cover_upload_path(instance, filename):
    now = timezone.now()
    extension = _safe_image_extension(filename)
    return f"blog/covers/{now:%Y/%m}/{secrets.token_hex(12)}{extension}"


def blog_image_upload_path(instance, filename):
    now = timezone.now()
    extension = _safe_image_extension(filename)
    return f"blog/images/{now:%Y/%m}/{secrets.token_hex(12)}{extension}"


def _unique_slug(model_class, source, instance_pk=None, max_length=160):
    base_slug = slugify(source, allow_unicode=True)[:max_length].strip("-_")
    if not base_slug:
        base_slug = f"post-{secrets.token_hex(4)}"
    slug = base_slug
    suffix_index = 2
    queryset = model_class.objects.all()
    if instance_pk:
        queryset = queryset.exclude(pk=instance_pk)
    while queryset.filter(slug=slug).exists():
        suffix = f"-{suffix_index}"
        slug = f"{base_slug[: max_length - len(suffix)]}{suffix}"
        suffix_index += 1
    return slug


class BlogTag(models.Model):
    name = models.CharField("标签名", max_length=32, unique=True)
    slug = models.SlugField("URL 标识", max_length=64, unique=True, allow_unicode=True, blank=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "博客标签"
        verbose_name_plural = "博客标签"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(BlogTag, self.name, self.pk, max_length=64)
        super().save(*args, **kwargs)


class BlogPost(models.Model):
    FORMAT_MARKDOWN = "markdown"
    FORMAT_RICH_TEXT = "richtext"
    FORMAT_CHOICES = (
        (FORMAT_MARKDOWN, "Markdown"),
        (FORMAT_RICH_TEXT, "富文本"),
    )

    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "草稿"),
        (STATUS_PUBLISHED, "已发布"),
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blog_posts",
        verbose_name="作者",
    )
    title = models.CharField("标题", max_length=120)
    slug = models.SlugField("URL 标识", max_length=160, unique=True, allow_unicode=True, blank=True)
    summary = models.TextField("摘要", max_length=360, blank=True)
    content = models.TextField("正文")
    content_format = models.CharField("编辑器类型", max_length=16, choices=FORMAT_CHOICES, default=FORMAT_MARKDOWN)
    status = models.CharField("状态", max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    category = models.CharField("分类", max_length=40, blank=True)
    tags = models.ManyToManyField(BlogTag, blank=True, related_name="posts", verbose_name="标签")
    cover_image = models.ImageField("封面图", upload_to=blog_cover_upload_path, blank=True)
    allow_comments = models.BooleanField("允许评论", default=True)
    view_count = models.PositiveIntegerField("浏览量", default=0)
    api_request_count = models.PositiveIntegerField("API 请求总次数", default=0)
    published_at = models.DateTimeField("发布时间", null=True, blank=True, db_index=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        ordering = ["-published_at", "-created_at"]
        verbose_name = "博客文章"
        verbose_name_plural = "博客文章"
        indexes = [
            models.Index(fields=["status", "-published_at"]),
            models.Index(fields=["author", "status", "-updated_at"]),
            models.Index(fields=["category", "status"]),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(BlogPost, self.title, self.pk, max_length=160)
        if self.status == self.STATUS_PUBLISHED and not self.published_at:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("blog_detail", kwargs={"slug": self.slug})

    @property
    def display_status(self):
        return dict(self.STATUS_CHOICES).get(self.status, self.status)

    @property
    def read_minutes(self):
        text = strip_tags(self.content or "")
        text_length = len("".join(text.split()))
        return max(1, math.ceil(text_length / 500))

    @property
    def word_count(self):
        text = strip_tags(self.content or "")
        return len("".join(text.split()))

    @property
    def auto_summary(self):
        if self.summary:
            return self.summary
        text = strip_tags(self.content or "")
        return Truncator(text.replace("#", "").strip()).chars(140)

    def visible_to(self, user):
        if self.status == self.STATUS_PUBLISHED:
            return True
        if not user or not user.is_authenticated:
            return False
        return self.author_id == user.id or user.is_staff


class BlogVipPage(models.Model):
    STATUS_DRAFT = BlogPost.STATUS_DRAFT
    STATUS_PUBLISHED = BlogPost.STATUS_PUBLISHED
    STATUS_CHOICES = BlogPost.STATUS_CHOICES

    title = models.CharField("页面标题", max_length=80)
    slug = models.SlugField("URL 标识", max_length=80, unique=True, allow_unicode=True, blank=True)
    summary = models.TextField("页面摘要", max_length=240, blank=True)
    content = models.TextField(
        "页面正文",
        blank=True,
        help_text=(
            "支持 Markdown 或富文本。Markdown 可使用占位符：{{ display_name }}、{{ sample_api_url }}、"
            "{{ sample_post_title }}、{{ current_cookie_header }}、{{ current_cookie_python }}、"
            "{{ api_window_days }}、{{ api_limit }}。"
        ),
    )
    content_format = models.CharField("编辑器类型", max_length=16, choices=BlogPost.FORMAT_CHOICES, default=BlogPost.FORMAT_MARKDOWN)
    status = models.CharField("状态", max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    is_home = models.BooleanField("作为 VIP 首页", default=False, db_index=True)
    show_in_nav = models.BooleanField("显示在 VIP 导航", default=True)
    sort_order = models.PositiveSmallIntegerField("排序", default=100, db_index=True)
    published_at = models.DateTimeField("发布时间", null=True, blank=True, db_index=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        ordering = ["sort_order", "title"]
        verbose_name = "VIP 内容页"
        verbose_name_plural = "VIP 内容页"
        indexes = [
            models.Index(fields=["status", "sort_order"], name="blog_vip_status_order_idx"),
            models.Index(fields=["status", "is_home"], name="blog_vip_status_home_idx"),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(BlogVipPage, self.title, self.pk, max_length=80)
        if self.status == self.STATUS_PUBLISHED and not self.published_at:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)
        if self.is_home:
            BlogVipPage.objects.exclude(pk=self.pk).update(is_home=False)

    def get_absolute_url(self):
        if self.is_home:
            return reverse("blog_vip_guide")
        return reverse("blog_vip_page", kwargs={"slug": self.slug})


class BlogImage(models.Model):
    uploader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blog_images",
        verbose_name="上传者",
    )
    post = models.ForeignKey(
        BlogPost,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="images",
        verbose_name="关联文章",
    )
    image = models.ImageField("图片", upload_to=blog_image_upload_path)
    original_name = models.CharField("原始文件名", max_length=160, blank=True)
    content_type = models.CharField("MIME 类型", max_length=80, blank=True)
    size = models.PositiveIntegerField("文件大小", default=0)
    width = models.PositiveIntegerField("宽度", null=True, blank=True)
    height = models.PositiveIntegerField("高度", null=True, blank=True)
    created_at = models.DateTimeField("上传时间", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "博客图片"
        verbose_name_plural = "博客图片"

    def __str__(self):
        return self.original_name or self.image.name


class BlogComment(models.Model):
    post = models.ForeignKey(BlogPost, on_delete=models.CASCADE, related_name="comments", verbose_name="文章")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
        verbose_name="父评论",
    )
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blog_comments", verbose_name="作者")
    content = models.TextField("评论内容", max_length=1200)
    is_pinned = models.BooleanField("已置顶", default=False)
    pinned_at = models.DateTimeField("置顶时间", null=True, blank=True)
    is_deleted = models.BooleanField("已删除", default=False)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "博客评论"
        verbose_name_plural = "博客评论"
        indexes = [
            models.Index(fields=["post", "is_deleted", "created_at"]),
            models.Index(fields=["post", "parent", "is_deleted", "created_at"]),
            models.Index(fields=["post", "is_pinned", "-pinned_at"]),
        ]

    def __str__(self):
        return f"{self.author} @ {self.post}"

    @property
    def is_reply(self):
        return self.parent_id is not None


class BlogReaction(models.Model):
    post = models.ForeignKey(BlogPost, on_delete=models.CASCADE, related_name="reactions", verbose_name="文章")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blog_reactions", verbose_name="用户")
    created_at = models.DateTimeField("创建时间", auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "user"], name="unique_blog_reaction"),
        ]
        verbose_name = "博客点赞"
        verbose_name_plural = "博客点赞"

    def __str__(self):
        return f"{self.user} liked {self.post}"


class BlogBookmark(models.Model):
    post = models.ForeignKey(BlogPost, on_delete=models.CASCADE, related_name="bookmarks", verbose_name="文章")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blog_bookmarks", verbose_name="用户")
    created_at = models.DateTimeField("创建时间", auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "user"], name="unique_blog_bookmark"),
        ]
        ordering = ["-created_at"]
        verbose_name = "博客收藏"
        verbose_name_plural = "博客收藏"

    def __str__(self):
        return f"{self.user} bookmarked {self.post}"


class BlogArticleApiAccess(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blog_article_api_accesses",
        verbose_name="用户",
    )
    post = models.ForeignKey(
        BlogPost,
        on_delete=models.CASCADE,
        related_name="api_accesses",
        verbose_name="文章",
    )
    window_start = models.DateTimeField("计数周期开始", default=timezone.now)
    request_count = models.PositiveSmallIntegerField("周期内请求次数", default=0)
    last_requested_at = models.DateTimeField("最后请求时间", null=True, blank=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "post"], name="unique_blog_article_api_access"),
        ]
        indexes = [
            models.Index(fields=["user", "post"]),
            models.Index(fields=["window_start"]),
        ]
        verbose_name = "文章 API 请求次数"
        verbose_name_plural = "文章 API 请求次数"

    def __str__(self):
        return f"{self.user} / {self.post} / {self.request_count}"

    def resets_at(self, days=7):
        return self.window_start + timedelta(days=days)
