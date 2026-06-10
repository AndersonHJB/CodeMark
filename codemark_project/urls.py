from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include, path


urlpatterns = [
    path("", include("apps.articles.urls")),
    path("", include("apps.editor.urls")),
    path("", include("apps.cpp_editor.urls")),
    path("", include("apps.sharing.urls")),
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()
