import re
from datetime import timedelta
from functools import wraps

import markdown
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, F, Prefetch, Q, Sum
from django.http import FileResponse, Http404, HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.templatetags.static import static
from django.urls import reverse
from django.utils import timezone
from django.utils.html import escape
from django.utils.html import strip_tags
from django.utils.safestring import mark_safe
from django.utils.text import Truncator
from django.views.decorators.http import require_GET, require_POST
from PIL import Image

from .exporters import build_blog_export_filename, build_blog_posts_markdown_archive
from .forms import validate_blog_image, BlogPostForm
from .models import BlogArticleApiAccess, BlogBookmark, BlogComment, BlogImage, BlogPost, BlogReaction, BlogTag
from .sanitizer import sanitize_rich_text
from apps.accounts.avatars import DEFAULT_AVATAR_STATIC_PATH, normalize_default_avatar_path
from apps.accounts.models import membership_payload_for_user


MAX_PINNED_COMMENTS = 10
ARTICLE_API_WINDOW_DAYS = 7
ARTICLE_API_LIMIT = 2
MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def _display_name(user):
    try:
        profile = user.codemark_profile
    except Exception:
        profile = None
    return (getattr(profile, "display_name", "") or user.get_full_name() or user.get_username()).strip()


def _profile_for_user(user):
    try:
        return user.codemark_profile
    except Exception:
        return None


def _avatar_url_for_user(user):
    profile = _profile_for_user(user)
    if profile and profile.avatar:
        return profile.avatar.url
    if profile:
        return static(normalize_default_avatar_path(profile.default_avatar))
    return static(DEFAULT_AVATAR_STATIC_PATH)


def _homepage_summary(post):
    source = post.summary or post.content or ""
    text = MARKDOWN_IMAGE_RE.sub(" ", source)
    text = MARKDOWN_LINK_RE.sub(r"\1", text)
    text = re.sub(r"[#>*_`~|-]+", " ", text)
    text = strip_tags(text)
    text = " ".join(text.split())
    return Truncator(text).chars(118) if text else post.auto_summary


def _homepage_cover_url(post):
    if post.cover_image:
        return post.cover_image.url
    match = MARKDOWN_IMAGE_RE.search(post.content or "")
    if not match:
        return ""
    url = match.group(1).strip("<>")
    if url.startswith("media/"):
        return f"/{url}"
    if url.startswith(("/", "http://", "https://")):
        return url
    return ""


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


def _user_can_use_article_api(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    profile = _profile_for_user(user)
    return membership_payload_for_user(user, profile)["can_use_article_api"]


def _json_time(value):
    return value.isoformat() if value else None


def _api_usage_payload(usage, limited=True):
    if not limited:
        return {
            "limited": False,
            "window_days": ARTICLE_API_WINDOW_DAYS,
            "limit": None,
            "used": None,
            "remaining": None,
            "window_start": None,
            "resets_at": None,
        }
    resets_at = usage.resets_at(ARTICLE_API_WINDOW_DAYS)
    return {
        "limited": True,
        "window_days": ARTICLE_API_WINDOW_DAYS,
        "limit": ARTICLE_API_LIMIT,
        "used": usage.request_count,
        "remaining": max(0, ARTICLE_API_LIMIT - usage.request_count),
        "window_start": _json_time(usage.window_start),
        "resets_at": _json_time(resets_at),
    }


def _consume_article_api_quota(user, post):
    now = timezone.now()
    window = timedelta(days=ARTICLE_API_WINDOW_DAYS)
    with transaction.atomic():
        usage, _ = BlogArticleApiAccess.objects.select_for_update().get_or_create(
            user=user,
            post=post,
            defaults={"window_start": now},
        )
        if now >= usage.window_start + window:
            usage.window_start = now
            usage.request_count = 0
        if usage.request_count >= ARTICLE_API_LIMIT:
            return False, _api_usage_payload(usage)
        usage.request_count += 1
        usage.last_requested_at = now
        usage.save(update_fields=["window_start", "request_count", "last_requested_at", "updated_at"])
        return True, _api_usage_payload(usage)


def _serialize_blog_user(request, user):
    profile_url = reverse("blog_user_home", kwargs={"author_username": user.username})
    return {
        "id": user.id,
        "username": user.username,
        "display_name": _display_name(user),
        "profile_url": request.build_absolute_uri(profile_url),
    }


def _serialize_comment(request, comment):
    return {
        "id": comment.id,
        "parent_id": comment.parent_id,
        "author": _serialize_blog_user(request, comment.author),
        "content": comment.content,
        "is_pinned": comment.is_pinned,
        "created_at": _json_time(comment.created_at),
        "updated_at": _json_time(comment.updated_at),
    }


def _build_article_api_payload(request, post, usage_payload):
    comments = (
        BlogComment.objects.filter(post=post, is_deleted=False)
        .select_related("author", "author__codemark_profile")
        .order_by("created_at")
    )
    article_url = request.build_absolute_uri(post.get_absolute_url())
    api_url = request.build_absolute_uri(reverse("blog_article_api", kwargs={"slug": post.slug}))
    cover_image_url = request.build_absolute_uri(post.cover_image.url) if post.cover_image else ""
    return {
        "ok": True,
        "usage": usage_payload,
        "article": {
            "id": post.id,
            "title": post.title,
            "slug": post.slug,
            "url": article_url,
            "api_url": api_url,
            "author": _serialize_blog_user(request, post.author),
            "summary": post.summary,
            "auto_summary": post.auto_summary,
            "category": post.category,
            "tags": [{"id": tag.id, "name": tag.name, "slug": tag.slug} for tag in post.tags.all()],
            "cover_image_url": cover_image_url,
            "content_format": post.content_format,
            "content": post.content,
            "content_html": str(render_post_body(post)),
            "status": post.status,
            "allow_comments": post.allow_comments,
            "published_at": _json_time(post.published_at),
            "created_at": _json_time(post.created_at),
            "updated_at": _json_time(post.updated_at),
            "stats": {
                "views": post.view_count,
                "api_requests": post.api_request_count,
                "likes": post.like_total,
                "bookmarks": post.bookmark_total,
                "comments": post.comment_total,
                "word_count": post.word_count,
                "read_minutes": post.read_minutes,
            },
            "comments": [_serialize_comment(request, comment) for comment in comments],
        },
    }


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


def _can_moderate_post(user, post):
    return bool(user and user.is_authenticated and (post.author_id == user.id or user.is_staff))


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


def _suggested_authors(limit=4, current_user=None):
    User = get_user_model()
    authors = User.objects.filter(blog_posts__status=BlogPost.STATUS_PUBLISHED)
    if current_user and current_user.is_authenticated:
        authors = authors.exclude(pk=current_user.pk)
    authors = (
        authors
        .select_related("codemark_profile")
        .annotate(
            published_post_count=Count(
                "blog_posts",
                filter=Q(blog_posts__status=BlogPost.STATUS_PUBLISHED),
                distinct=True,
            ),
            total_views=Sum(
                "blog_posts__view_count",
                filter=Q(blog_posts__status=BlogPost.STATUS_PUBLISHED),
            ),
        )
        .filter(published_post_count__gt=0)
        .order_by("-published_post_count", "-total_views", "username")[:limit]
    )
    recommendations = []
    for author in authors:
        profile = _profile_for_user(author)
        recommendations.append(
            {
                "user": author,
                "display_name": _display_name(author),
                "avatar_url": _avatar_url_for_user(author),
                "bio": getattr(profile, "bio", ""),
                "post_count": author.published_post_count,
                "profile_url": reverse("blog_user_home", kwargs={"author_username": author.username}),
            }
        )
    return recommendations


def blog_list(request, tag_slug=None, author_username=None):
    query = (request.GET.get("q") or "").strip()
    category = (request.GET.get("category") or "").strip()
    feed_mode = "featured" if request.GET.get("sort") == "featured" else "for-you"
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

    if feed_mode == "featured":
        posts = posts.distinct().order_by("-view_count", "-like_total", "-published_at", "-created_at")
    else:
        posts = posts.distinct().order_by("-published_at", "-created_at")
    paginator = Paginator(posts, 10)
    page_obj = paginator.get_page(request.GET.get("page"))
    page_post_ids = [post.id for post in page_obj.object_list]
    liked_post_ids = set()
    bookmarked_post_ids = set()
    if request.user.is_authenticated and page_post_ids:
        liked_post_ids = set(
            BlogReaction.objects.filter(user=request.user, post_id__in=page_post_ids).values_list("post_id", flat=True)
        )
        bookmarked_post_ids = set(
            BlogBookmark.objects.filter(user=request.user, post_id__in=page_post_ids).values_list("post_id", flat=True)
        )
    for post in page_obj.object_list:
        post.home_summary = _homepage_summary(post)
        post.home_cover_url = _homepage_cover_url(post)
        post.home_absolute_url = request.build_absolute_uri(post.get_absolute_url())
        post.home_user_liked = post.id in liked_post_ids
        post.home_user_bookmarked = post.id in bookmarked_post_ids
    pagination_params = request.GET.copy()
    pagination_params.pop("page", None)
    if feed_mode != "featured":
        pagination_params.pop("sort", None)
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
        "feed_mode": feed_mode,
        "pagination_query": pagination_params.urlencode(),
        "stats": stats,
        "my_drafts": my_drafts,
        "suggested_authors": _suggested_authors(current_user=request.user),
        "can_use_article_api": _user_can_use_article_api(request.user),
        "display_name": _display_name,
        **_sidebar_context(),
    }
    return render(request, "blog/list.html", context)


@blog_login_required
def blog_vip_guide(request):
    if not _user_can_use_article_api(request.user):
        return HttpResponseForbidden("仅 VIP 用户或管理员可以阅读此页面")

    sample_post = _public_posts().order_by("-published_at", "-created_at").first()
    sample_api_url = ""
    if sample_post:
        sample_api_url = request.build_absolute_uri(reverse("blog_article_api", kwargs={"slug": sample_post.slug}))

    return render(
        request,
        "blog/vip_guide.html",
        {
            "sample_post": sample_post,
            "sample_api_url": sample_api_url,
            "api_window_days": ARTICLE_API_WINDOW_DAYS,
            "api_limit": ARTICLE_API_LIMIT,
            "display_name": _display_name(request.user),
        },
    )


def blog_user_home(request, author_username):
    User = get_user_model()
    author = get_object_or_404(User, username=author_username)
    profile = _profile_for_user(author)
    posts = _public_posts().filter(author=author).distinct().order_by("-published_at", "-created_at")
    paginator = Paginator(posts, 10)
    page_obj = paginator.get_page(request.GET.get("page"))
    base_posts = BlogPost.objects.filter(author=author, status=BlogPost.STATUS_PUBLISHED)
    stats = base_posts.aggregate(post_count=Count("id"), total_views=Sum("view_count"))
    categories = (
        base_posts.exclude(category="")
        .values("category")
        .annotate(post_count=Count("id"))
        .order_by("-post_count", "category")
    )
    tags = (
        BlogTag.objects.filter(posts__author=author, posts__status=BlogPost.STATUS_PUBLISHED)
        .annotate(post_count=Count("posts", filter=Q(posts__author=author, posts__status=BlogPost.STATUS_PUBLISHED), distinct=True))
        .filter(post_count__gt=0)
        .order_by("-post_count", "name")
    )
    author_home_path = reverse("blog_user_home", kwargs={"author_username": author.username})
    return render(
        request,
        "blog/user_home.html",
        {
            "author": author,
            "profile": profile,
            "avatar_url": _avatar_url_for_user(author),
            "author_display_name": _display_name(author),
            "author_home_url": request.build_absolute_uri(author_home_path),
            "page_obj": page_obj,
            "posts": page_obj.object_list,
            "categories": categories,
            "tags": tags,
            "post_count": stats["post_count"] or 0,
            "total_views": stats["total_views"] or 0,
            "like_count": BlogReaction.objects.filter(post__author=author, post__status=BlogPost.STATUS_PUBLISHED).count(),
            "comment_count": BlogComment.objects.filter(
                post__author=author,
                post__status=BlogPost.STATUS_PUBLISHED,
                is_deleted=False,
            ).count(),
        },
    )


def blog_detail(request, slug):
    post = get_object_or_404(_post_queryset(), slug=slug)
    if not post.visible_to(request.user):
        raise Http404("文章不存在")
    if post.status == BlogPost.STATUS_PUBLISHED:
        BlogPost.objects.filter(pk=post.pk).update(view_count=F("view_count") + 1)
        post.view_count += 1

    reply_queryset = (
        BlogComment.objects.filter(is_deleted=False)
        .select_related("author", "author__codemark_profile")
        .order_by("created_at")
    )
    comments = (
        post.comments.filter(is_deleted=False, parent__isnull=True)
        .select_related("author", "author__codemark_profile")
        .prefetch_related(Prefetch("replies", queryset=reply_queryset, to_attr="visible_replies"))
        .order_by("created_at")
    )
    pinned_comments = (
        post.comments.filter(is_deleted=False, parent__isnull=True, is_pinned=True)
        .select_related("author", "author__codemark_profile")
        .order_by("-pinned_at", "-created_at")[:MAX_PINNED_COMMENTS]
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
            "pinned_comments": pinned_comments,
            "comment_count": post.comment_total,
            "max_pinned_comments": MAX_PINNED_COMMENTS,
            "can_moderate_comments": _can_moderate_post(request.user, post),
            "related_posts": related_posts,
            "user_liked": user_liked,
            "user_bookmarked": user_bookmarked,
            "article_api_url": request.build_absolute_uri(reverse("blog_article_api", kwargs={"slug": post.slug})),
            "display_name": _display_name,
            **_sidebar_context(),
        },
    )


@require_GET
@json_login_required
def blog_article_api(request, slug):
    post = get_object_or_404(_post_queryset(), slug=slug)
    if not post.visible_to(request.user):
        raise Http404("文章不存在")
    if not _user_can_use_article_api(request.user):
        return JsonResponse({"ok": False, "message": "仅 VIP 用户或管理员可以访问文章 API"}, status=403)

    if request.user.is_staff:
        usage_payload = _api_usage_payload(None, limited=False)
    else:
        allowed, usage_payload = _consume_article_api_quota(request.user, post)
        if not allowed:
            return JsonResponse(
                {
                    "ok": False,
                    "message": f"请求次数已用完，{ARTICLE_API_WINDOW_DAYS} 天内最多请求 {ARTICLE_API_LIMIT} 次",
                    "usage": usage_payload,
                },
                status=429,
                json_dumps_params={"ensure_ascii": False},
            )

    BlogPost.objects.filter(pk=post.pk).update(api_request_count=F("api_request_count") + 1)
    post.api_request_count += 1
    return JsonResponse(
        _build_article_api_payload(request, post, usage_payload),
        json_dumps_params={"ensure_ascii": False},
    )


@blog_login_required
def blog_download_markdown(request, slug):
    if not request.user.is_staff:
        raise Http404("文章不存在")
    post = get_object_or_404(BlogPost.objects.select_related("author").prefetch_related("tags"), slug=slug)
    archive = build_blog_posts_markdown_archive([post])
    return FileResponse(
        archive,
        as_attachment=True,
        filename=build_blog_export_filename(),
        content_type="application/zip",
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
    parent = None
    parent_id = request.POST.get("parent_id")
    if parent_id:
        parent = get_object_or_404(BlogComment, pk=parent_id, post=post, is_deleted=False, parent__isnull=True)
    if len(content) < 2:
        messages.error(request, "评论至少需要 2 个字符")
    elif len(content) > 1200:
        messages.error(request, "评论不能超过 1200 个字符")
    else:
        comment = BlogComment.objects.create(post=post, parent=parent, author=request.user, content=content)
        messages.success(request, "回复已发布" if parent else "评论已发布")
        return redirect(f"{post.get_absolute_url()}#comment-{comment.id}")
    return redirect(f"{post.get_absolute_url()}#comments")


@require_POST
@blog_login_required
def blog_toggle_comment_pin(request, slug, comment_id):
    post = get_object_or_404(BlogPost, slug=slug)
    if not _can_moderate_post(request.user, post):
        raise Http404("文章不存在")
    comment = get_object_or_404(BlogComment, pk=comment_id, post=post, is_deleted=False)
    if comment.parent_id:
        messages.error(request, "目前仅支持置顶主评论")
        return redirect(f"{post.get_absolute_url()}#comment-{comment.id}")

    if comment.is_pinned:
        comment.is_pinned = False
        comment.pinned_at = None
        comment.save(update_fields=["is_pinned", "pinned_at", "updated_at"])
        messages.success(request, "已取消置顶")
        return redirect(f"{post.get_absolute_url()}#comment-{comment.id}")

    pinned_count = post.comments.filter(is_deleted=False, parent__isnull=True, is_pinned=True).count()
    if pinned_count >= MAX_PINNED_COMMENTS:
        messages.error(request, f"最多只能置顶 {MAX_PINNED_COMMENTS} 条评论")
        return redirect(f"{post.get_absolute_url()}#comments")

    comment.is_pinned = True
    comment.pinned_at = timezone.now()
    comment.save(update_fields=["is_pinned", "pinned_at", "updated_at"])
    messages.success(request, "评论已置顶")
    return redirect(f"{post.get_absolute_url()}#comment-{comment.id}")


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
