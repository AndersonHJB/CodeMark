from django.urls import path

from . import views


urlpatterns = [
    path("", views.index, name="index"),
    path("article/<path:filename>", views.article, name="article"),
]
