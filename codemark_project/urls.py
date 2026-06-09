from django.conf import settings
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include, path


urlpatterns = [
    path("", include("apps.codemark.urls")),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()
