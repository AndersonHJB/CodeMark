from django.contrib import admin
from django.http import FileResponse
from django.utils import timezone

from .exporters import build_blog_export_filename, build_blog_posts_markdown_archive
from .models import BlogArticleApiAccess, BlogBookmark, BlogComment, BlogImage, BlogPost, BlogReaction, BlogTag, BlogVipPage


@admin.register(BlogTag)
class BlogTagAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "author",
        "status",
        "category",
        "published_at",
        "updated_at",
        "view_count",
        "api_request_count",
    )
    list_filter = ("status", "content_format", "allow_comments", "category", "published_at")
    search_fields = ("title", "summary", "content", "author__username", "author__email")
    autocomplete_fields = ("author", "tags")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("view_count", "api_request_count", "created_at", "updated_at")
    actions = ("export_markdown_zip",)

    @admin.action(description="导出选中文章为 Markdown ZIP")
    def export_markdown_zip(self, request, queryset):
        archive = build_blog_posts_markdown_archive(queryset.select_related("author").prefetch_related("tags"))
        return FileResponse(
            archive,
            as_attachment=True,
            filename=build_blog_export_filename(),
            content_type="application/zip",
        )


@admin.register(BlogVipPage)
class BlogVipPageAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "slug",
        "status",
        "is_home",
        "show_in_nav",
        "sort_order",
        "published_at",
        "updated_at",
    )
    list_filter = ("status", "is_home", "show_in_nav", "published_at")
    list_editable = ("status", "is_home", "show_in_nav", "sort_order")
    search_fields = ("title", "slug", "summary", "content")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("published_at", "created_at", "updated_at")
    actions = ("publish_pages", "unpublish_pages")
    fieldsets = (
        ("页面信息", {"fields": ("title", "slug", "summary")}),
        ("正文内容", {"fields": ("content_format", "content")}),
        ("发布设置", {"fields": ("status", "is_home", "show_in_nav", "sort_order", "published_at")}),
        ("时间", {"fields": ("created_at", "updated_at")}),
    )

    @admin.action(description="发布选中的 VIP 页面")
    def publish_pages(self, request, queryset):
        now = timezone.now()
        queryset.filter(published_at__isnull=True).update(
            status=BlogVipPage.STATUS_PUBLISHED,
            published_at=now,
            updated_at=now,
        )
        queryset.filter(published_at__isnull=False).update(
            status=BlogVipPage.STATUS_PUBLISHED,
            updated_at=now,
        )

    @admin.action(description="下架选中的 VIP 页面")
    def unpublish_pages(self, request, queryset):
        queryset.update(status=BlogVipPage.STATUS_DRAFT, updated_at=timezone.now())


@admin.register(BlogImage)
class BlogImageAdmin(admin.ModelAdmin):
    list_display = ("original_name", "uploader", "content_type", "size", "width", "height", "created_at")
    list_filter = ("content_type", "created_at")
    search_fields = ("original_name", "image", "uploader__username", "uploader__email")
    autocomplete_fields = ("uploader", "post")


@admin.register(BlogComment)
class BlogCommentAdmin(admin.ModelAdmin):
    list_display = ("post", "author", "parent", "is_pinned", "is_deleted", "created_at")
    list_filter = ("is_pinned", "is_deleted", "created_at")
    search_fields = ("content", "post__title", "author__username", "author__email")
    autocomplete_fields = ("post", "parent", "author")


@admin.register(BlogReaction)
class BlogReactionAdmin(admin.ModelAdmin):
    list_display = ("post", "user", "created_at")
    autocomplete_fields = ("post", "user")


@admin.register(BlogBookmark)
class BlogBookmarkAdmin(admin.ModelAdmin):
    list_display = ("post", "user", "created_at")
    autocomplete_fields = ("post", "user")


@admin.register(BlogArticleApiAccess)
class BlogArticleApiAccessAdmin(admin.ModelAdmin):
    list_display = ("post", "user", "request_count", "window_start", "last_requested_at", "updated_at")
    list_filter = ("window_start", "last_requested_at")
    list_editable = ("request_count",)
    search_fields = ("post__title", "post__slug", "user__username", "user__email")
    autocomplete_fields = ("post", "user")
    readonly_fields = ("last_requested_at", "created_at", "updated_at")
    actions = ("reset_api_count",)

    @admin.action(description="重置选中的 API 请求次数")
    def reset_api_count(self, request, queryset):
        now = timezone.now()
        queryset.update(request_count=0, window_start=now, last_requested_at=None, updated_at=now)
