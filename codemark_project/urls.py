from django.conf import settings
from django.contrib import admin
from django.conf.urls.static import static
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include, path

from apps.accounts import views as account_views


urlpatterns = [
    path("accounts/", include("apps.accounts.urls")),
    path("", include("apps.blog.urls")),
    path("", include("apps.articles.urls")),
    path("", include("apps.editor.urls")),
    path("", include("apps.cpp_editor.urls")),
    path("", include("apps.python_judge.urls")),
    path("", include("apps.sharing.urls")),
    path("", include("apps.algorithms.urls")),
    path("admin/avatar-gallery/", account_views.admin_avatar_gallery, name="admin_avatar_gallery"),
    path(
        "admin/avatar-gallery/<int:profile_id>/",
        account_views.admin_avatar_gallery_detail,
        name="admin_avatar_gallery_detail",
    ),
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
