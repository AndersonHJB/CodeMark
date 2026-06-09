from django.urls import path

from . import views


urlpatterns = [
    path("", views.index, name="index"),
    path("article/<path:filename>", views.article, name="article"),
    path("editor", views.editor, name="editor"),
    path("sharecode", views.sharecode, name="sharecode"),
    path("upload_code", views.upload_code, name="upload_code"),
    path("download_project_zip", views.download_project_zip, name="download_project_zip"),
    path(
        "share_asset/<str:project_id>/<path:asset_path>",
        views.get_shared_asset,
        name="get_shared_asset",
    ),
    path("share/<str:project_id>", views.show_shared_code, name="show_shared_code"),
]
