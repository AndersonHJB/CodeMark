from django.contrib import admin
from django.shortcuts import redirect

from .models import SharedFileAdminEntry


@admin.register(SharedFileAdminEntry)
class SharedFileAdminEntryAdmin(admin.ModelAdmin):
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
        return redirect("admin_share_files")
