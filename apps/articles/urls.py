from django.urls import path

from . import views


urlpatterns = [
    path("admin/article-sidebar/", views.admin_article_sidebar, name="admin_article_sidebar"),
    path("", views.index, name="index"),
    path("article/<path:filename>", views.article, name="article"),
]
