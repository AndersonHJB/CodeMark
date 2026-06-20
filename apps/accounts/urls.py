from django.urls import path

from . import views


urlpatterns = [
    path("profile/", views.profile_page, name="account_profile_page"),
    path("api/session/", views.session_view, name="account_session"),
    path("api/random-profile/", views.random_profile_view, name="account_random_profile"),
    path("api/send-code/", views.send_code_view, name="account_send_code"),
    path("api/register/", views.register_view, name="account_register"),
    path("api/login/", views.login_view, name="account_login"),
    path("api/logout/", views.logout_view, name="account_logout"),
    path("api/profile/", views.profile_view, name="account_profile"),
]
