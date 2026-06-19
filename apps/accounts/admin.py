from django.contrib import admin
from django.shortcuts import redirect

from .models import AvatarGalleryAdminEntry, EmailVerificationCode, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "display_name",
        "is_vip",
        "is_permanent_vip",
        "default_avatar",
        "avatar",
        "original_avatar",
        "created_at",
        "updated_at",
    )
    list_filter = ("is_vip", "is_permanent_vip")
    list_editable = ("is_vip", "is_permanent_vip")
    search_fields = ("user__username", "user__email", "display_name")


@admin.register(EmailVerificationCode)
class EmailVerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("email", "purpose", "created_at", "expires_at", "used_at", "attempts")
    list_filter = ("purpose", "used_at")
    search_fields = ("email",)
    readonly_fields = ("code_hash", "created_at", "used_at", "attempts", "request_ip")


@admin.register(AvatarGalleryAdminEntry)
class AvatarGalleryAdminEntryAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.user.is_staff

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return request.user.is_staff

    def has_module_permission(self, request):
        return request.user.is_staff

    def get_model_perms(self, request):
        if not request.user.is_staff:
            return {}
        return {"view": True}

    def changelist_view(self, request, extra_context=None):
        return redirect("admin_avatar_gallery")
