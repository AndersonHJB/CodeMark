from django.conf import settings
from django.db import models
from django.utils import timezone

from .avatars import DEFAULT_AVATAR_CHOICES, DEFAULT_AVATAR_STATIC_PATH


def membership_payload_for_user(user, profile=None):
    if not user or not getattr(user, "is_authenticated", False):
        return {
            "is_staff": False,
            "is_vip": False,
            "is_permanent_vip": False,
            "can_use_article_api": False,
            "membership_tier": "",
            "membership_label": "",
        }
    if profile is None:
        try:
            profile = user.codemark_profile
        except Exception:
            profile = None
    is_permanent_vip = bool(profile and profile.is_permanent_vip)
    is_vip = bool(profile and profile.is_vip)
    is_staff = bool(user.is_staff)
    if is_staff:
        tier = "admin"
        label = "管理员"
    elif is_permanent_vip:
        tier = "permanent-vip"
        label = "永久 VIP"
    elif is_vip:
        tier = "vip"
        label = "VIP"
    else:
        tier = ""
        label = ""
    return {
        "is_staff": is_staff,
        "is_vip": is_vip,
        "is_permanent_vip": is_permanent_vip,
        "can_use_article_api": bool(is_staff or is_vip or is_permanent_vip),
        "membership_tier": tier,
        "membership_label": label,
    }


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="codemark_profile",
    )
    display_name = models.CharField("昵称", max_length=40, blank=True)
    bio = models.CharField("个人简介", max_length=160, blank=True)
    default_avatar = models.CharField(
        "默认头像",
        max_length=128,
        choices=DEFAULT_AVATAR_CHOICES,
        default=DEFAULT_AVATAR_STATIC_PATH,
    )
    avatar = models.ImageField("头像", upload_to="accounts/avatars/", blank=True)
    original_avatar = models.ImageField("原始头像", upload_to="accounts/original_avatars/", blank=True)
    is_vip = models.BooleanField("VIP 用户", default=False, db_index=True)
    is_permanent_vip = models.BooleanField("永久 VIP", default=False, db_index=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        verbose_name = "用户资料"
        verbose_name_plural = "用户资料"

    def __str__(self):
        return self.display_name or self.user.get_username()


class AvatarGalleryAdminEntry(models.Model):
    class Meta:
        managed = False
        verbose_name = "头像画册"
        verbose_name_plural = "头像画册"


class EmailVerificationCode(models.Model):
    PURPOSE_REGISTER = "register"
    PURPOSE_CHOICES = (
        (PURPOSE_REGISTER, "注册"),
    )

    email = models.EmailField("邮箱", db_index=True)
    purpose = models.CharField("用途", max_length=20, choices=PURPOSE_CHOICES, default=PURPOSE_REGISTER)
    code_hash = models.CharField("验证码哈希", max_length=128)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    expires_at = models.DateTimeField("过期时间")
    used_at = models.DateTimeField("使用时间", null=True, blank=True)
    attempts = models.PositiveSmallIntegerField("验证次数", default=0)
    request_ip = models.GenericIPAddressField("请求 IP", null=True, blank=True)

    class Meta:
        verbose_name = "邮箱验证码"
        verbose_name_plural = "邮箱验证码"
        indexes = [
            models.Index(fields=["email", "purpose", "created_at"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"{self.email} / {self.purpose}"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    @property
    def is_used(self):
        return self.used_at is not None
