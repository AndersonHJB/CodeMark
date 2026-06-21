from django.urls import path

from . import views


urlpatterns = [
    path("blog/", views.blog_list, name="blog_list"),
    path("blog/vip/", views.blog_vip_guide, name="blog_vip_guide"),
    path("blog/vip/<str:slug>/", views.blog_vip_guide, name="blog_vip_page"),
    path("blog/write/", views.blog_write, name="blog_write"),
    path("blog/me/", views.blog_mine, name="blog_mine"),
    path("blog/u/<str:author_username>/", views.blog_user_home, name="blog_user_home"),
    path("blog/tag/<str:tag_slug>/", views.blog_list, name="blog_tag"),
    path("blog/author/<str:author_username>/", views.blog_list, name="blog_author"),
    path("blog/api/images/", views.blog_upload_image, name="blog_upload_image"),
    path("blog/<str:slug>/edit/", views.blog_edit, name="blog_edit"),
    path("blog/<str:slug>/delete/", views.blog_delete, name="blog_delete"),
    path("blog/<str:slug>/api/", views.blog_article_api, name="blog_article_api"),
    path("blog/<str:slug>/download/", views.blog_download_markdown, name="blog_download_markdown"),
    path("blog/<str:slug>/comments/", views.blog_add_comment, name="blog_add_comment"),
    path("blog/<str:slug>/comments/<int:comment_id>/pin/", views.blog_toggle_comment_pin, name="blog_toggle_comment_pin"),
    path("blog/<str:slug>/reaction/", views.blog_toggle_reaction, name="blog_toggle_reaction"),
    path("blog/<str:slug>/bookmark/", views.blog_toggle_bookmark, name="blog_toggle_bookmark"),
    path("blog/<str:slug>/", views.blog_detail, name="blog_detail"),
]
