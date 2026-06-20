from django.conf import settings
from django.db import OperationalError, ProgrammingError
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
    PURPOSE_LOGIN = "login"
    PURPOSE_EMAIL_CHANGE_OLD = "email_change_old"
    PURPOSE_EMAIL_CHANGE_NEW = "email_change_new"
    PURPOSE_CHOICES = (
        (PURPOSE_REGISTER, "注册"),
        (PURPOSE_LOGIN, "邮箱验证码登录"),
        (PURPOSE_EMAIL_CHANGE_OLD, "邮箱变更-原邮箱"),
        (PURPOSE_EMAIL_CHANGE_NEW, "邮箱变更-新邮箱"),
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


class AccountLoginSettings(models.Model):
    METHOD_EMAIL_PASSWORD = "email_password"
    METHOD_EMAIL_CODE = "email_code"
    METHOD_USERNAME_PASSWORD = "username_password"

    enable_email_password = models.BooleanField("邮箱 + 密码", default=True)
    enable_email_code = models.BooleanField("邮箱 + 邮箱验证码", default=True)
    enable_username_password = models.BooleanField("用户名 + 密码", default=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        verbose_name = "登录方式设置"
        verbose_name_plural = "登录方式设置"

    def __str__(self):
        return "CodeMark 登录方式"

    def clean(self):
        from django.core.exceptions import ValidationError

        if not any((
            self.enable_email_password,
            self.enable_email_code,
            self.enable_username_password,
        )):
            raise ValidationError("至少需要开启一种登录方式")

    def save(self, *args, **kwargs):
        self.pk = 1
        self.full_clean()
        return super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings

    def enabled_methods(self):
        methods = []
        if self.enable_email_password:
            methods.append(self.METHOD_EMAIL_PASSWORD)
        if self.enable_email_code:
            methods.append(self.METHOD_EMAIL_CODE)
        if self.enable_username_password:
            methods.append(self.METHOD_USERNAME_PASSWORD)
        return methods

    def default_method(self):
        methods = self.enabled_methods()
        return methods[0] if methods else self.METHOD_EMAIL_PASSWORD


def _default_login_methods_payload():
    return {
        "email_password": True,
        "email_code": True,
        "username_password": True,
        "default": AccountLoginSettings.METHOD_EMAIL_PASSWORD,
        "enabled": [
            AccountLoginSettings.METHOD_EMAIL_PASSWORD,
            AccountLoginSettings.METHOD_EMAIL_CODE,
            AccountLoginSettings.METHOD_USERNAME_PASSWORD,
        ],
    }


def login_methods_payload(settings=None):
    if settings is None:
        try:
            settings = AccountLoginSettings.load()
        except (OperationalError, ProgrammingError):
            return _default_login_methods_payload()
        except Exception as exc:
            if exc.__class__.__name__ == "DatabaseOperationForbidden":
                return _default_login_methods_payload()
            raise
    return {
        "email_password": settings.enable_email_password,
        "email_code": settings.enable_email_code,
        "username_password": settings.enable_username_password,
        "default": settings.default_method(),
        "enabled": settings.enabled_methods(),
    }
