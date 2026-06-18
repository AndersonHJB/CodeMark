from functools import wraps

import markdown
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django.db.models import Count, F, Q
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils.html import escape
from django.utils.html import strip_tags
from django.utils.safestring import mark_safe
from django.views.decorators.http import require_POST
from PIL import Image

from .forms import validate_blog_image, BlogPostForm
from .models import BlogBookmark, BlogComment, BlogImage, BlogPost, BlogReaction, BlogTag
from .sanitizer import sanitize_rich_text


def _display_name(user):
    try:
        profile = user.codemark_profile
    except Exception:
        profile = None
    return (getattr(profile, "display_name", "") or user.get_full_name() or user.get_username()).strip()


def _login_redirect(request):
    messages.info(request, "请先登录后再继续操作")
    return redirect(f"{reverse('blog_list')}?login=1&next={request.path}")


def blog_login_required(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return _login_redirect(request)
        return view_func(request, *args, **kwargs)

    return wrapped


def json_login_required(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"ok": False, "message": "请先登录"}, status=401)
        return view_func(request, *args, **kwargs)

    return wrapped


def _post_queryset():
    return (
        BlogPost.objects.select_related("author", "author__codemark_profile")
        .prefetch_related("tags")
        .annotate(
            like_total=Count("reactions", distinct=True),
            comment_total=Count("comments", filter=Q(comments__is_deleted=False), distinct=True),
            bookmark_total=Count("bookmarks", distinct=True),
        )
    )


def _public_posts():
    return _post_queryset().filter(status=BlogPost.STATUS_PUBLISHED)


def _render_markdown(content):
    md = markdown.Markdown(
        extensions=[
            "extra",
            "admonition",
            "attr_list",
            "def_list",
            "fenced_code",
            "footnotes",
            "sane_lists",
            "tables",
            "toc",
        ],
        output_format="html5",
    )
    return sanitize_rich_text(md.convert(content or ""))


def render_post_body(post):
    if post.content_format == BlogPost.FORMAT_RICH_TEXT:
        return mark_safe(sanitize_rich_text(post.content))
    return mark_safe(_render_markdown(post.content))


def _sidebar_context():
    categories = (
        BlogPost.objects.filter(status=BlogPost.STATUS_PUBLISHED)
        .exclude(category="")
        .values("category")
        .annotate(post_count=Count("id"))
        .order_by("category")[:16]
    )
    popular_tags = (
        BlogTag.objects.filter(posts__status=BlogPost.STATUS_PUBLISHED)
        .annotate(post_count=Count("posts", filter=Q(posts__status=BlogPost.STATUS_PUBLISHED), distinct=True))
        .filter(post_count__gt=0)
        .order_by("-post_count", "name")[:24]
    )
    trending_posts = _public_posts().order_by("-view_count", "-like_total", "-published_at")[:5]
    return {
        "categories": categories,
        "popular_tags": popular_tags,
        "trending_posts": trending_posts,
    }


def blog_list(request, tag_slug=None, author_username=None):
    query = (request.GET.get("q") or "").strip()
    category = (request.GET.get("category") or "").strip()
    posts = _public_posts()
    active_tag = None
    active_author = None

    if tag_slug:
        active_tag = get_object_or_404(BlogTag, slug=tag_slug)
        posts = posts.filter(tags=active_tag)
    if author_username:
        User = get_user_model()
        active_author = get_object_or_404(User, username=author_username)
        posts = posts.filter(author=active_author)
    if category:
        posts = posts.filter(category=category)
    if query:
        posts = posts.filter(
            Q(title__icontains=query)
            | Q(summary__icontains=query)
            | Q(content__icontains=query)
            | Q(category__icontains=query)
            | Q(tags__name__icontains=query)
        )

    posts = posts.distinct().order_by("-published_at", "-created_at")
    paginator = Paginator(posts, 10)
    page_obj = paginator.get_page(request.GET.get("page"))
    stats = {
        "post_count": BlogPost.objects.filter(status=BlogPost.STATUS_PUBLISHED).count(),
        "author_count": BlogPost.objects.filter(status=BlogPost.STATUS_PUBLISHED).values("author").distinct().count(),
        "tag_count": BlogTag.objects.filter(posts__status=BlogPost.STATUS_PUBLISHED).distinct().count(),
    }
    my_drafts = []
    if request.user.is_authenticated:
        my_drafts = BlogPost.objects.filter(author=request.user, status=BlogPost.STATUS_DRAFT).order_by("-updated_at")[:4]

    context = {
        "page_obj": page_obj,
        "posts": page_obj.object_list,
        "query": query,
        "category": category,
        "active_tag": active_tag,
        "active_author": active_author,
        "stats": stats,
        "my_drafts": my_drafts,
        "display_name": _display_name,
        **_sidebar_context(),
    }
    return render(request, "blog/list.html", context)


def blog_detail(request, slug):
    post = get_object_or_404(_post_queryset(), slug=slug)
    if not post.visible_to(request.user):
        raise Http404("文章不存在")
    if post.status == BlogPost.STATUS_PUBLISHED:
        BlogPost.objects.filter(pk=post.pk).update(view_count=F("view_count") + 1)
        post.view_count += 1

    comments = (
        post.comments.filter(is_deleted=False)
        .select_related("author", "author__codemark_profile")
        .order_by("created_at")
    )
    related_posts = (
        _public_posts()
        .exclude(pk=post.pk)
        .filter(Q(category=post.category) | Q(tags__in=post.tags.all()))
        .distinct()
        .order_by("-published_at")[:4]
    )
    user_liked = False
    user_bookmarked = False
    if request.user.is_authenticated:
        user_liked = BlogReaction.objects.filter(post=post, user=request.user).exists()
        user_bookmarked = BlogBookmark.objects.filter(post=post, user=request.user).exists()

    return render(
        request,
        "blog/detail.html",
        {
            "post": post,
            "body_html": render_post_body(post),
            "comments": comments,
            "related_posts": related_posts,
            "user_liked": user_liked,
            "user_bookmarked": user_bookmarked,
            "display_name": _display_name,
            **_sidebar_context(),
        },
    )


@blog_login_required
def blog_mine(request):
    posts = _post_queryset().filter(author=request.user).order_by("-updated_at")
    bookmarked_posts = _public_posts().filter(bookmarks__user=request.user).order_by("-bookmarks__created_at")[:12]
    return render(
        request,
        "blog/mine.html",
        {
            "posts": posts,
            "bookmarked_posts": bookmarked_posts,
            "display_name": _display_name,
        },
    )


def _save_post_from_form(request, form, post=None):
    post = form.save(commit=False)
    action = request.POST.get("action") or "save"
    if action == "publish":
        post.status = BlogPost.STATUS_PUBLISHED
    elif action == "draft":
        post.status = BlogPost.STATUS_DRAFT
    if not post.author_id:
        post.author = request.user
    post.save()
    form.save_tags(post)
    return post, action


@blog_login_required
def blog_write(request):
    if request.method == "POST":
        form = BlogPostForm(request.POST, request.FILES)
        if form.is_valid():
            post, action = _save_post_from_form(request, form)
            messages.success(request, "文章已发布" if action == "publish" else "草稿已保存")
            if action == "publish":
                return redirect(post.get_absolute_url())
            return redirect("blog_edit", slug=post.slug)
    else:
        form = BlogPostForm(initial={"content_format": BlogPost.FORMAT_MARKDOWN, "allow_comments": True})
    return render(
        request,
        "blog/editor.html",
        {
            "form": form,
            "post": None,
            "is_edit": False,
            "editor_upload_url": reverse("blog_upload_image"),
            "rich_initial": "",
        },
    )


@blog_login_required
def blog_edit(request, slug):
    post = get_object_or_404(BlogPost.objects.prefetch_related("tags"), slug=slug)
    if post.author_id != request.user.id and not request.user.is_staff:
        raise Http404("文章不存在")
    if request.method == "POST":
        form = BlogPostForm(request.POST, request.FILES, instance=post)
        if form.is_valid():
            post, action = _save_post_from_form(request, form, post)
            messages.success(request, "文章已发布" if action == "publish" else "文章已保存")
            if action == "draft":
                return redirect("blog_edit", slug=post.slug)
            return redirect(post.get_absolute_url())
    else:
        form = BlogPostForm(instance=post)
    return render(
        request,
        "blog/editor.html",
        {
            "form": form,
            "post": post,
            "is_edit": True,
            "editor_upload_url": reverse("blog_upload_image"),
            "rich_initial": post.content if post.content_format == BlogPost.FORMAT_RICH_TEXT else "",
        },
    )


@blog_login_required
def blog_delete(request, slug):
    post = get_object_or_404(BlogPost, slug=slug)
    if post.author_id != request.user.id and not request.user.is_staff:
        raise Http404("文章不存在")
    if request.method == "POST":
        post.delete()
        messages.success(request, "文章已删除")
        return redirect("blog_mine")
    return render(request, "blog/confirm_delete.html", {"post": post})


@require_POST
@blog_login_required
def blog_add_comment(request, slug):
    post = get_object_or_404(BlogPost, slug=slug)
    if not post.visible_to(request.user) or not post.allow_comments:
        raise Http404("文章不存在")
    content = strip_tags((request.POST.get("content") or "").strip())
    if len(content) < 2:
        messages.error(request, "评论至少需要 2 个字符")
    elif len(content) > 1200:
        messages.error(request, "评论不能超过 1200 个字符")
    else:
        BlogComment.objects.create(post=post, author=request.user, content=content)
        messages.success(request, "评论已发布")
    return redirect(f"{post.get_absolute_url()}#comments")


@require_POST
@json_login_required
def blog_upload_image(request):
    upload = request.FILES.get("image")
    if not upload:
        return JsonResponse({"ok": False, "message": "请选择图片"}, status=400)
    try:
        validate_blog_image(upload)
    except Exception as exc:
        return JsonResponse({"ok": False, "message": str(exc)}, status=400)
    with Image.open(upload) as image:
        width, height = image.size
    upload.seek(0)
    blog_image = BlogImage.objects.create(
        uploader=request.user,
        image=upload,
        original_name=getattr(upload, "name", ""),
        content_type=getattr(upload, "content_type", ""),
        size=getattr(upload, "size", 0) or 0,
        width=width,
        height=height,
    )
    image_url = blog_image.image.url
    alt = blog_image.original_name or "image"
    safe_alt = escape(alt)
    safe_url = escape(image_url)
    return JsonResponse(
        {
            "ok": True,
            "url": image_url,
            "markdown": f"![{alt}]({image_url})",
            "html": f'<img src="{safe_url}" alt="{safe_alt}">',
            "name": alt,
            "width": width,
            "height": height,
        }
    )


@require_POST
@json_login_required
def blog_toggle_reaction(request, slug):
    post = get_object_or_404(BlogPost, slug=slug, status=BlogPost.STATUS_PUBLISHED)
    reaction, created = BlogReaction.objects.get_or_create(post=post, user=request.user)
    if not created:
        reaction.delete()
    return JsonResponse(
        {
            "ok": True,
            "active": created,
            "count": BlogReaction.objects.filter(post=post).count(),
        }
    )


@require_POST
@json_login_required
def blog_toggle_bookmark(request, slug):
    post = get_object_or_404(BlogPost, slug=slug, status=BlogPost.STATUS_PUBLISHED)
    bookmark, created = BlogBookmark.objects.get_or_create(post=post, user=request.user)
    if not created:
        bookmark.delete()
    return JsonResponse(
        {
            "ok": True,
            "active": created,
            "count": BlogBookmark.objects.filter(post=post).count(),
        }
    )
