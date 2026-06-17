from django.contrib import admin

from .models import EmailVerificationCode, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name", "default_avatar", "created_at", "updated_at")
    search_fields = ("user__username", "user__email", "display_name")


@admin.register(EmailVerificationCode)
class EmailVerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("email", "purpose", "created_at", "expires_at", "used_at", "attempts")
    list_filter = ("purpose", "used_at")
    search_fields = ("email",)
    readonly_fields = ("code_hash", "created_at", "used_at", "attempts", "request_ip")
