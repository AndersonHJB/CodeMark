from django.urls import path

from . import views


urlpatterns = [
    path("admin/share-files/", views.admin_share_files, name="admin_share_files"),
    path("admin/share-files/<str:project_id>/", views.admin_share_file_detail, name="admin_share_file_detail"),
    path("accounts/shares/", views.account_share_links, name="account_share_links"),
    path(
        "accounts/shares/<str:project_id>/delete/",
        views.delete_account_share_link,
        name="delete_account_share_link",
    ),
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
