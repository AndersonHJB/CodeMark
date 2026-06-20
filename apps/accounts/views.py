import io
import json
import logging
import re
import secrets
from datetime import timedelta
from pathlib import Path
from smtplib import SMTPException

from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import authenticate, get_user_model, login as auth_login, logout as auth_logout
from django.core.files.base import ContentFile
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.templatetags.static import static
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.decorators.http import require_GET, require_POST
from PIL import Image, ImageOps, UnidentifiedImageError, features

from .avatars import (
    DEFAULT_AVATAR_STATIC_PATH,
    normalize_default_avatar_path,
    random_default_avatar_path,
)
from .models import EmailVerificationCode, UserProfile, membership_payload_for_user
from .random_profiles import random_default_nickname, random_default_profile


CODE_EXPIRE_MINUTES = 10
MAX_CODE_ATTEMPTS = 5
MAX_AVATAR_BYTES = 2 * 1024 * 1024
COMPRESSED_AVATAR_MAX_DIMENSION = 512
COMPRESSED_AVATAR_INITIAL_QUALITY = 85
COMPRESSED_AVATAR_MIN_QUALITY = 55
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
logger = logging.getLogger(__name__)


def _json_error(message, status=400, field=None):
    payload = {"ok": False, "message": message}
    if field:
        payload["field"] = field
    return JsonResponse(payload, status=status)


def _load_payload(request):
    if request.content_type and request.content_type.startswith("application/json"):
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except (TypeError, ValueError, UnicodeDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}
    return request.POST


def _normalize_email(email):
    return (email or "").strip().lower()


def _email_error(email):
    if not email:
        return "请输入有效邮箱地址"
    try:
        validate_email(email)
    except ValidationError:
        return "请输入有效邮箱地址"
    return ""


def _hash_code(email, code):
    return salted_hmac(
        "codemark.accounts.email_code",
        f"{_normalize_email(email)}:{code}",
        secret=settings.SECRET_KEY,
    ).hexdigest()


def _client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _absolute_static_url(request, static_path):
    return request.build_absolute_uri(static(static_path))


def _avatar_url_for_profile(profile, request):
    if profile.avatar:
        return request.build_absolute_uri(profile.avatar.url)
    return _absolute_static_url(request, normalize_default_avatar_path(profile.default_avatar))


def _user_payload(user, request):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return {
        "is_authenticated": True,
        "username": user.get_username(),
        "email": user.email,
        "display_name": profile.display_name or user.get_full_name() or user.get_username(),
        "bio": profile.bio,
        "avatar_url": _avatar_url_for_profile(profile, request),
        "default_avatar": normalize_default_avatar_path(profile.default_avatar),
        **membership_payload_for_user(user, profile),
    }


def _safe_avatar_filename(original_name, extension):
    stem = Path(original_name or "avatar").stem
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "-", stem).strip(".-") or "avatar"
    return f"{stem[:60]}-{secrets.token_hex(6)}{extension}"


def _original_avatar_extension(original_name, content_type):
    extension = Path(original_name or "").suffix.lower()
    if extension in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return extension
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(content_type, ".img")


def _image_has_alpha(image):
    return image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info)


def _avatar_output_format(image):
    if features.check("webp"):
        return "WEBP", ".webp"
    if _image_has_alpha(image):
        return "PNG", ".png"
    return "JPEG", ".jpg"


def _encode_avatar_image(image, output_format, quality):
    output = io.BytesIO()
    if output_format == "WEBP":
        image.save(output, format=output_format, quality=quality, method=6)
    elif output_format == "JPEG":
        image.save(output, format=output_format, quality=quality, optimize=True, progressive=True)
    else:
        image.save(output, format=output_format, optimize=True)
    return output.getvalue()


def _compressed_avatar_file(original_bytes, original_name):
    with Image.open(io.BytesIO(original_bytes)) as opened_image:
        image = ImageOps.exif_transpose(opened_image)
        output_format, extension = _avatar_output_format(image)

        if output_format == "JPEG":
            image = image.convert("RGB")
        elif image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if _image_has_alpha(image) else "RGB")

        max_dimension = COMPRESSED_AVATAR_MAX_DIMENSION
        quality = COMPRESSED_AVATAR_INITIAL_QUALITY
        while True:
            resized = image.copy()
            resized.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
            compressed_bytes = _encode_avatar_image(resized, output_format, quality)
            if len(compressed_bytes) <= MAX_AVATAR_BYTES or max_dimension <= 128:
                break
            if output_format in {"WEBP", "JPEG"} and quality > COMPRESSED_AVATAR_MIN_QUALITY:
                quality = max(COMPRESSED_AVATAR_MIN_QUALITY, quality - 10)
            else:
                max_dimension = max(128, int(max_dimension * 0.75))

    return ContentFile(compressed_bytes, name=_safe_avatar_filename(original_name, extension))


def _validate_avatar_bytes(original_bytes):
    try:
        with Image.open(io.BytesIO(original_bytes)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        return False
    return True


def _admin_image_file_payload(file_field):
    payload = {
        "name": "",
        "url": "",
        "size": None,
        "width": None,
        "height": None,
    }
    if not file_field or not file_field.name:
        return payload

    payload["name"] = file_field.name
    try:
        payload["url"] = file_field.url
    except ValueError:
        payload["url"] = ""
    try:
        payload["size"] = file_field.size
    except (OSError, ValueError):
        payload["size"] = None
    try:
        with file_field.open("rb") as image_file:
            with Image.open(image_file) as image:
                payload["width"], payload["height"] = image.size
    except (UnidentifiedImageError, OSError, ValueError):
        pass
    return payload


def _admin_avatar_gallery_item(profile):
    return {
        "profile": profile,
        "avatar": _admin_image_file_payload(profile.avatar),
        "original_avatar": _admin_image_file_payload(profile.original_avatar),
        "display_name": profile.display_name or profile.user.get_full_name() or profile.user.get_username(),
    }


def _unique_username_from_email(email):
    User = get_user_model()
    local_part = re.sub(r"[^A-Za-z0-9_.-]+", "", email.split("@", 1)[0]) or "user"
    candidate = local_part[:120]
    if not User.objects.filter(username__iexact=candidate).exists():
        return candidate

    for _ in range(20):
        suffix = secrets.token_hex(3)
        candidate = f"{local_part[:110]}_{suffix}"
        if not User.objects.filter(username__iexact=candidate).exists():
            return candidate
    return f"user_{secrets.token_hex(8)}"


def _find_login_user(identifier):
    User = get_user_model()
    identifier = (identifier or "").strip()
    if "@" in identifier:
        return User.objects.filter(email__iexact=identifier).first()
    return User.objects.filter(username__iexact=identifier).first()


def _verify_code(email, purpose, code):
    email = _normalize_email(email)
    code = (code or "").strip()
    record = (
        EmailVerificationCode.objects.filter(
            email__iexact=email,
            purpose=purpose,
            used_at__isnull=True,
        )
        .order_by("-created_at")
        .first()
    )
    if not record:
        return False, "请先获取邮箱验证码"
    if record.is_expired:
        return False, "验证码已过期，请重新获取"
    if record.attempts >= MAX_CODE_ATTEMPTS:
        return False, "验证码错误次数过多，请重新获取"

    record.attempts += 1
    record.save(update_fields=["attempts"])
    if not constant_time_compare(record.code_hash, _hash_code(email, code)):
        return False, "验证码不正确"

    record.used_at = timezone.now()
    record.save(update_fields=["used_at"])
    return True, ""


def _send_registration_code_email(email, code):
    context = {
        "code": code,
        "expire_minutes": CODE_EXPIRE_MINUTES,
        "support_email": getattr(settings, "CODEMARK_SUPPORT_EMAIL", ""),
    }
    text_body = render_to_string("emails/register_verification.txt", context)
    html_body = render_to_string("emails/register_verification.html", context)
    message = EmailMultiAlternatives(
        subject="CodeMark 注册验证码",
        body=text_body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        to=[email],
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)


@require_GET
def profile_page(request):
    return render(request, "accounts/profile.html")


@require_GET
def session_view(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {
                "ok": True,
                "user": {
                    "is_authenticated": False,
                    "display_name": "登录 CodeMark",
                    "email": "",
                    "username": "",
                    "bio": "",
                    "avatar_url": _absolute_static_url(request, DEFAULT_AVATAR_STATIC_PATH),
                    **membership_payload_for_user(None),
                },
            }
        )
    return JsonResponse({"ok": True, "user": _user_payload(request.user, request)})


@require_GET
def random_profile_view(request):
    return JsonResponse({"ok": True, "profile": random_default_profile()})


@require_POST
def send_code_view(request):
    payload = _load_payload(request)
    email = _normalize_email(payload.get("email"))
    purpose = payload.get("purpose") or EmailVerificationCode.PURPOSE_REGISTER

    if purpose != EmailVerificationCode.PURPOSE_REGISTER:
        return _json_error("不支持的验证码用途", field="purpose")
    email_error = _email_error(email)
    if email_error:
        return _json_error(email_error, field="email")

    User = get_user_model()
    if User.objects.filter(email__iexact=email).exists():
        return _json_error("该邮箱已经注册，可直接登录", field="email")

    recent_code = EmailVerificationCode.objects.filter(
        email__iexact=email,
        purpose=purpose,
        created_at__gte=timezone.now() - timedelta(seconds=60),
    ).first()
    if recent_code:
        return _json_error("验证码发送过于频繁，请稍后再试", status=429)

    code = f"{secrets.randbelow(1000000):06d}"
    EmailVerificationCode.objects.filter(
        email__iexact=email,
        purpose=purpose,
        used_at__isnull=True,
    ).update(used_at=timezone.now())
    verification = EmailVerificationCode.objects.create(
        email=email,
        purpose=purpose,
        code_hash=_hash_code(email, code),
        expires_at=timezone.now() + timedelta(minutes=CODE_EXPIRE_MINUTES),
        request_ip=_client_ip(request),
    )

    try:
        _send_registration_code_email(email, code)
    except (SMTPException, OSError) as exc:
        verification.used_at = timezone.now()
        verification.save(update_fields=["used_at"])
        logger.exception("Failed to send registration code to %s: %s", email, exc)
        return _json_error("验证码邮件发送失败，请检查邮箱服务配置", status=502)
    return JsonResponse({"ok": True, "message": "验证码已发送，请查看邮箱"})


@require_POST
@transaction.atomic
def register_view(request):
    payload = _load_payload(request)
    email = _normalize_email(payload.get("email"))
    password = payload.get("password") or ""
    code = payload.get("code") or ""
    display_name = (payload.get("display_name") or "").strip() or random_default_nickname()
    bio = (payload.get("bio") or "").strip()

    email_error = _email_error(email)
    if email_error:
        return _json_error(email_error, field="email")
    if len(password) < 8:
        return _json_error("密码至少需要 8 位", field="password")

    User = get_user_model()
    if User.objects.filter(email__iexact=email).exists():
        return _json_error("该邮箱已经注册，可直接登录", field="email")

    verified, message = _verify_code(email, EmailVerificationCode.PURPOSE_REGISTER, code)
    if not verified:
        return _json_error(message, field="code")

    username = _unique_username_from_email(email)
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=display_name[:150],
    )
    UserProfile.objects.create(
        user=user,
        display_name=display_name[:40],
        bio=bio[:160],
        default_avatar=random_default_avatar_path(),
    )
    auth_login(request, user)
    return JsonResponse({"ok": True, "message": "注册成功", "user": _user_payload(user, request)})


@require_POST
def login_view(request):
    payload = _load_payload(request)
    identifier = (payload.get("identifier") or payload.get("email") or "").strip()
    password = payload.get("password") or ""
    user_record = _find_login_user(identifier)
    if not user_record:
        return _json_error("账号或密码不正确", status=401)

    user = authenticate(request, username=user_record.get_username(), password=password)
    if user is None:
        return _json_error("账号或密码不正确", status=401)
    if not user.is_active:
        return _json_error("账号已停用", status=403)

    UserProfile.objects.get_or_create(user=user)
    auth_login(request, user)
    return JsonResponse({"ok": True, "message": "登录成功", "user": _user_payload(user, request)})


@require_POST
def logout_view(request):
    auth_logout(request)
    return JsonResponse(
        {
            "ok": True,
            "message": "已退出登录",
            "user": {
                "is_authenticated": False,
                "display_name": "登录 CodeMark",
                "email": "",
                "username": "",
                "bio": "",
                "avatar_url": _absolute_static_url(request, DEFAULT_AVATAR_STATIC_PATH),
                **membership_payload_for_user(None),
            },
        }
    )


@require_POST
def profile_view(request):
    if not request.user.is_authenticated:
        return _json_error("请先登录", status=401)

    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    display_name = (request.POST.get("display_name") or "").strip()
    bio = (request.POST.get("bio") or "").strip()
    avatar_file = request.FILES.get("avatar")
    use_random_default_avatar = request.POST.get("use_random_default_avatar") in {"1", "true", "on"}

    if display_name:
        profile.display_name = display_name[:40]
        request.user.first_name = profile.display_name[:150]
        request.user.save(update_fields=["first_name"])
    profile.bio = bio[:160]

    if use_random_default_avatar:
        profile.default_avatar = random_default_avatar_path()
        if profile.avatar:
            profile.avatar.delete(save=False)
        profile.avatar = ""
    elif avatar_file:
        content_type = getattr(avatar_file, "content_type", "")
        if content_type not in ALLOWED_AVATAR_TYPES:
            return _json_error("头像仅支持 JPG、PNG、WebP 或 GIF", field="avatar")
        avatar_file.seek(0)
        original_bytes = avatar_file.read()
        if not _validate_avatar_bytes(original_bytes):
            return _json_error("头像文件无法识别，请重新选择图片", field="avatar")
        if profile.avatar:
            profile.avatar.delete(save=False)
        original_name = getattr(avatar_file, "name", "avatar")
        try:
            compressed_avatar = _compressed_avatar_file(original_bytes, original_name)
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            return _json_error("头像文件无法识别，请重新选择图片", field="avatar")
        profile.original_avatar.save(
            _safe_avatar_filename(original_name, _original_avatar_extension(original_name, content_type)),
            ContentFile(original_bytes),
            save=False,
        )
        profile.avatar.save(
            compressed_avatar.name,
            compressed_avatar,
            save=False,
        )

    profile.save()
    message = "已使用随机默认头像" if use_random_default_avatar else "资料已更新"
    return JsonResponse({"ok": True, "message": message, "user": _user_payload(request.user, request)})


@staff_member_required
def admin_avatar_gallery(request):
    query = (request.GET.get("q") or "").strip()
    profiles = UserProfile.objects.select_related("user").exclude(avatar="")
    if query:
        profiles = profiles.filter(
            Q(display_name__icontains=query)
            | Q(user__username__icontains=query)
            | Q(user__email__icontains=query)
            | Q(avatar__icontains=query)
            | Q(original_avatar__icontains=query)
        )
    profiles = profiles.order_by("-updated_at", "-created_at")
    items = [_admin_avatar_gallery_item(profile) for profile in profiles]

    context = admin.site.each_context(request)
    context.update({
        "title": "头像画册",
        "items": items,
        "item_count": len(items),
        "query": query,
    })
    return render(request, "admin/avatar_gallery.html", context)


@staff_member_required
def admin_avatar_gallery_detail(request, profile_id):
    profile = get_object_or_404(
        UserProfile.objects.select_related("user").exclude(avatar=""),
        pk=profile_id,
    )
    context = admin.site.each_context(request)
    context.update({
        "title": f"头像详情 - {profile.display_name or profile.user.get_username()}",
        "item": _admin_avatar_gallery_item(profile),
    })
    return render(request, "admin/avatar_gallery_detail.html", context)
