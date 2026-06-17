import json
import re
import tempfile

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from .avatars import DEFAULT_AVATAR_STATIC_PATHS
from .models import EmailVerificationCode, UserProfile


def post_json(client, url_name, payload):
    return client.post(
        reverse(url_name),
        data=json.dumps(payload),
        content_type="application/json",
    )


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CodeMark <no-reply@example.test>",
)
class AccountApiTests(TestCase):
    def test_send_code_and_register_logs_user_in(self):
        response = post_json(self.client, "account_send_code", {"email": "NewUser@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ok"], True)
        self.assertEqual(len(mail.outbox), 1)
        code = re.search(r"(\d{6})", mail.outbox[0].body).group(1)

        register_response = post_json(
            self.client,
            "account_register",
            {
                "email": "newuser@example.com",
                "display_name": "新用户",
                "password": "test-password",
                "code": code,
            },
        )

        self.assertEqual(register_response.status_code, 200)
        payload = register_response.json()
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["user"]["is_authenticated"], True)
        self.assertEqual(payload["user"]["display_name"], "新用户")

        User = get_user_model()
        user = User.objects.get(email="newuser@example.com")
        profile = UserProfile.objects.get(user=user)
        self.assertEqual(profile.display_name, "新用户")
        self.assertIn(profile.default_avatar, DEFAULT_AVATAR_STATIC_PATHS)
        self.assertIn("/static/images/default-avatars/avatar-", payload["user"]["avatar_url"])
        self.assertIsNotNone(EmailVerificationCode.objects.get(email="newuser@example.com").used_at)

        session_response = self.client.get(reverse("account_session"))
        self.assertEqual(session_response.json()["user"]["email"], "newuser@example.com")

    def test_register_rejects_wrong_code(self):
        post_json(self.client, "account_send_code", {"email": "wrong@example.com"})

        response = post_json(
            self.client,
            "account_register",
            {
                "email": "wrong@example.com",
                "password": "test-password",
                "code": "000000",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "code")
        self.assertFalse(get_user_model().objects.filter(email="wrong@example.com").exists())

    def test_duplicate_email_cannot_request_register_code(self):
        get_user_model().objects.create_user(
            username="existing",
            email="exists@example.com",
            password="test-password",
        )

        response = post_json(self.client, "account_send_code", {"email": "exists@example.com"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "email")
        self.assertEqual(len(mail.outbox), 0)

    def test_login_and_logout_by_email(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="login-user",
            email="login@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="登录用户")

        login_response = post_json(
            self.client,
            "account_login",
            {"identifier": "login@example.com", "password": "test-password"},
        )

        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.json()["user"]["display_name"], "登录用户")

        logout_response = post_json(self.client, "account_logout", {})

        self.assertEqual(logout_response.status_code, 200)
        self.assertEqual(logout_response.json()["user"]["is_authenticated"], False)

    def test_profile_updates_display_name_and_avatar(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                User = get_user_model()
                user = User.objects.create_user(
                    username="profile-user",
                    email="profile@example.com",
                    password="test-password",
                )
                self.client.force_login(user)
                avatar = SimpleUploadedFile(
                    "avatar.png",
                    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
                    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
                    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82",
                    content_type="image/png",
                )

                response = self.client.post(
                    reverse("account_profile"),
                    data={"display_name": "头像用户", "bio": "学习 Python", "avatar": avatar},
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["user"]["display_name"], "头像用户")
                self.assertIn("/media/accounts/avatars/", payload["user"]["avatar_url"])


class AccountTemplateTests(TestCase):
    def test_editor_sidebar_includes_account_entry(self):
        response = self.client.get(reverse("editor"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-account-trigger', html=False)
        self.assertContains(response, 'static/images/default-avatars/avatar-01.png', html=False)

    def test_sharecode_sidebar_includes_account_entry(self):
        response = self.client.get(reverse("sharecode"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-account-trigger', html=False)
        self.assertContains(response, 'js/accounts.js', html=False)

    def test_accounts_api_requires_csrf_when_enforced(self):
        csrf_client = Client(enforce_csrf_checks=True)

        denied_response = csrf_client.post(reverse("account_logout"), {})

        self.assertEqual(denied_response.status_code, 403)
