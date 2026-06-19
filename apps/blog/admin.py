from django.contrib import admin
from django.http import FileResponse

from .exporters import build_blog_export_filename, build_blog_posts_markdown_archive
from .models import BlogBookmark, BlogComment, BlogImage, BlogPost, BlogReaction, BlogTag


@admin.register(BlogTag)
class BlogTagAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "status", "category", "published_at", "updated_at", "view_count")
    list_filter = ("status", "content_format", "allow_comments", "category", "published_at")
    search_fields = ("title", "summary", "content", "author__username", "author__email")
    autocomplete_fields = ("author", "tags")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("view_count", "created_at", "updated_at")
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
