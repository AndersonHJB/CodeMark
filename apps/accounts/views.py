import json
import re
import secrets
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model, login as auth_login, logout as auth_logout
from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.templatetags.static import static
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.decorators.http import require_GET, require_POST
from PIL import Image, UnidentifiedImageError

from .avatars import (
    DEFAULT_AVATAR_STATIC_PATH,
    normalize_default_avatar_path,
    random_default_avatar_path,
)
from .models import EmailVerificationCode, UserProfile


CODE_EXPIRE_MINUTES = 10
MAX_CODE_ATTEMPTS = 5
MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


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
                    "avatar_url": _absolute_static_url(request, DEFAULT_AVATAR_STATIC_PATH),
                },
            }
        )
    return JsonResponse({"ok": True, "user": _user_payload(request.user, request)})


@require_POST
def send_code_view(request):
    payload = _load_payload(request)
    email = _normalize_email(payload.get("email"))
    purpose = payload.get("purpose") or EmailVerificationCode.PURPOSE_REGISTER

    if purpose != EmailVerificationCode.PURPOSE_REGISTER:
        return _json_error("不支持的验证码用途", field="purpose")
    if not email or "@" not in email:
        return _json_error("请输入有效邮箱地址", field="email")

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
    EmailVerificationCode.objects.create(
        email=email,
        purpose=purpose,
        code_hash=_hash_code(email, code),
        expires_at=timezone.now() + timedelta(minutes=CODE_EXPIRE_MINUTES),
        request_ip=_client_ip(request),
    )

    send_mail(
        subject="CodeMark 注册验证码",
        message=f"你的 CodeMark 注册验证码是：{code}\n验证码 {CODE_EXPIRE_MINUTES} 分钟内有效。如非本人操作，请忽略此邮件。",
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[email],
        fail_silently=False,
    )
    return JsonResponse({"ok": True, "message": "验证码已发送，请查看邮箱"})


@require_POST
@transaction.atomic
def register_view(request):
    payload = _load_payload(request)
    email = _normalize_email(payload.get("email"))
    password = payload.get("password") or ""
    code = payload.get("code") or ""
    display_name = (payload.get("display_name") or "").strip()

    if not email or "@" not in email:
        return _json_error("请输入有效邮箱地址", field="email")
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
                "avatar_url": _absolute_static_url(request, DEFAULT_AVATAR_STATIC_PATH),
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
        if avatar_file.size > MAX_AVATAR_BYTES:
            return _json_error("头像不能超过 2MB", field="avatar")
        content_type = getattr(avatar_file, "content_type", "")
        if content_type not in ALLOWED_AVATAR_TYPES:
            return _json_error("头像仅支持 JPG、PNG、WebP 或 GIF", field="avatar")
        try:
            Image.open(avatar_file).verify()
            avatar_file.seek(0)
        except (UnidentifiedImageError, OSError):
            return _json_error("头像文件无法识别，请重新选择图片", field="avatar")
        profile.avatar = avatar_file

    profile.save()
    message = "已使用随机默认头像" if use_random_default_avatar else "资料已更新"
    return JsonResponse({"ok": True, "message": message, "user": _user_payload(request.user, request)})
