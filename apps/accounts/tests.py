import json
import re
import tempfile
from urllib.parse import unquote, urlparse

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from .avatars import DEFAULT_AVATAR_STATIC_PATHS
from .models import EmailVerificationCode, UserProfile
from .random_profiles import DEFAULT_BIOS, DEFAULT_NICKNAMES


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
                "bio": "正在学习编程",
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
        self.assertEqual(profile.bio, "正在学习编程")
        self.assertIn(profile.default_avatar, DEFAULT_AVATAR_STATIC_PATHS)
        avatar_path = unquote(urlparse(payload["user"]["avatar_url"]).path)
        self.assertTrue(avatar_path.endswith(f"/static/{profile.default_avatar}"))
        self.assertIsNotNone(EmailVerificationCode.objects.get(email="newuser@example.com").used_at)

        session_response = self.client.get(reverse("account_session"))
        self.assertEqual(session_response.json()["user"]["email"], "newuser@example.com")

    def test_register_code_email_includes_client_friendly_html_alternative(self):
        response = post_json(self.client, "account_send_code", {"email": "html-mail@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        code = re.search(r"(\d{6})", message.body).group(1)
        self.assertIn(f"你的 CodeMark 注册验证码是：{code}", message.body)
        self.assertEqual(len(message.alternatives), 1)
        html_body, mime_type = message.alternatives[0]
        self.assertEqual(mime_type, "text/html")
        self.assertIn("<table", html_body)
        self.assertIn('role="presentation"', html_body)
        self.assertIn("style=", html_body)
        self.assertIn(code, html_body)
        self.assertNotIn("<script", html_body.lower())
        self.assertNotIn("<style", html_body.lower())

    def test_random_profile_endpoint_returns_builtin_defaults(self):
        self.assertEqual(len(DEFAULT_NICKNAMES), 10000)
        self.assertEqual(len(DEFAULT_BIOS), 10000)

        response = self.client.get(reverse("account_random_profile"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["ok"], True)
        self.assertIn(payload["profile"]["display_name"], DEFAULT_NICKNAMES)
        self.assertIn(payload["profile"]["bio"], DEFAULT_BIOS)
        self.assertLessEqual(len(payload["profile"]["display_name"]), 40)
        self.assertLessEqual(len(payload["profile"]["bio"]), 160)

    def test_register_uses_random_default_nickname_when_blank(self):
        post_json(self.client, "account_send_code", {"email": "blank-name@example.com"})
        code = re.search(r"(\d{6})", mail.outbox[-1].body).group(1)

        response = post_json(
            self.client,
            "account_register",
            {
                "email": "blank-name@example.com",
                "display_name": "   ",
                "password": "test-password",
                "code": code,
            },
        )

        self.assertEqual(response.status_code, 200)
        display_name = response.json()["user"]["display_name"]
        self.assertIn(display_name, DEFAULT_NICKNAMES)
        profile = UserProfile.objects.get(user__email="blank-name@example.com")
        self.assertEqual(profile.display_name, display_name)

    def test_send_code_rejects_invalid_email(self):
        response = post_json(self.client, "account_send_code", {"email": "not-an-email"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "email")
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(EmailVerificationCode.objects.exists())

    def test_register_rejects_invalid_email(self):
        response = post_json(
            self.client,
            "account_register",
            {
                "email": "bad@",
                "password": "test-password",
                "code": "123456",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "email")
        self.assertFalse(get_user_model().objects.filter(email="bad@").exists())

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
                self.assertEqual(payload["user"]["bio"], "学习 Python")
                self.assertIn("/media/accounts/avatars/", payload["user"]["avatar_url"])

    def test_profile_can_switch_to_random_default_avatar(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                User = get_user_model()
                user = User.objects.create_user(
                    username="random-default-user",
                    email="random-default@example.com",
                    password="test-password",
                )
                UserProfile.objects.create(
                    user=user,
                    display_name="旧头像用户",
                    avatar=SimpleUploadedFile("avatar.png", b"old-avatar", content_type="image/png"),
                )
                self.client.force_login(user)

                response = self.client.post(
                    reverse("account_profile"),
                    data={
                        "display_name": "默认头像用户",
                        "bio": "使用默认头像",
                        "use_random_default_avatar": "1",
                    },
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                profile = UserProfile.objects.get(user=user)
                self.assertFalse(profile.avatar)
                self.assertIn(profile.default_avatar, DEFAULT_AVATAR_STATIC_PATHS)
                self.assertEqual(payload["user"]["display_name"], "默认头像用户")
                avatar_path = unquote(urlparse(payload["user"]["avatar_url"]).path)
                self.assertTrue(avatar_path.endswith(f"/static/{profile.default_avatar}"))

    def test_profile_avatar_upload_accepts_rotated_csrf_after_login(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                User = get_user_model()
                User.objects.create_user(
                    username="csrf-avatar-user",
                    email="csrf-avatar@example.com",
                    password="test-password",
                )
                csrf_client = Client(enforce_csrf_checks=True)
                csrf_client.get(reverse("editor"))
                old_csrf_token = csrf_client.cookies["csrftoken"].value

                login_response = csrf_client.post(
                    reverse("account_login"),
                    data=json.dumps(
                        {
                            "identifier": "csrf-avatar-user",
                            "password": "test-password",
                        }
                    ),
                    content_type="application/json",
                    HTTP_X_CSRFTOKEN=old_csrf_token,
                )

                self.assertEqual(login_response.status_code, 200)
                new_csrf_token = csrf_client.cookies["csrftoken"].value
                self.assertNotEqual(old_csrf_token, new_csrf_token)

                avatar = SimpleUploadedFile(
                    "avatar.png",
                    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
                    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
                    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82",
                    content_type="image/png",
                )
                profile_response = csrf_client.post(
                    reverse("account_profile"),
                    data={"display_name": "CSRF 头像", "bio": "上传成功", "avatar": avatar},
                    HTTP_X_CSRFTOKEN=new_csrf_token,
                )

                self.assertEqual(profile_response.status_code, 200)
                payload = profile_response.json()
                self.assertEqual(payload["user"]["display_name"], "CSRF 头像")
                self.assertIn("/media/accounts/avatars/", payload["user"]["avatar_url"])


class AccountTemplateTests(TestCase):
    def test_editor_sidebar_includes_account_entry(self):
        response = self.client.get(reverse("editor"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-account-trigger', html=False)
        self.assertContains(response, 'data-account-use-random-default', html=False)
        self.assertContains(response, 'data-account-random-profile="display_name"', html=False)
        self.assertContains(response, 'data-account-random-profile="bio"', html=False)
        self.assertContains(response, "randomProfileUrl", html=False)
        html = response.content.decode()
        self.assertIn('data-account-tab="login"', html)
        self.assertIn('data-account-tab="register"', html)
        self.assertIn('data-account-tab="profile" hidden', html)
        self.assertIn("data-account-open-login data-account-guest-only", html)
        self.assertIn("data-account-open-register data-account-guest-only", html)
        self.assertIn("data-account-open-profile data-account-auth-only hidden", html)

    def test_sharecode_sidebar_includes_account_entry(self):
        response = self.client.get(reverse("sharecode"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-account-trigger', html=False)
        self.assertContains(response, 'js/accounts.js', html=False)

    def test_home_topbar_includes_account_entry(self):
        response = self.client.get(reverse("index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "site-account-trigger", html=False)
        self.assertContains(response, 'data-account-open-login data-account-guest-only', html=False)
        self.assertContains(response, 'data-account-tab="login"', html=False)
        self.assertContains(response, 'js/accounts.js', html=False)

    def test_algorithms_topbar_includes_account_entry(self):
        response = self.client.get(reverse("algorithms"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "site-account-trigger", html=False)
        self.assertContains(response, 'data-account-open-login data-account-guest-only', html=False)
        self.assertContains(response, 'data-account-tab="login"', html=False)
        self.assertContains(response, 'js/accounts.js', html=False)

    def test_authenticated_editor_hides_guest_account_actions(self):
        user = get_user_model().objects.create_user(
            username="template-user",
            email="template@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="模板用户", bio="已登录简介")
        self.client.force_login(user)

        response = self.client.get(reverse("editor"))

        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertIn('data-account-tab="login" hidden', html)
        self.assertIn('data-account-tab="register" hidden', html)
        self.assertIn('data-account-tab="profile"', html)
        self.assertIn("data-account-open-login data-account-guest-only hidden", html)
        self.assertIn("data-account-open-register data-account-guest-only hidden", html)
        self.assertIn("data-account-open-profile data-account-auth-only", html)
        self.assertIn("已登录简介", html)

    def test_accounts_api_requires_csrf_when_enforced(self):
        csrf_client = Client(enforce_csrf_checks=True)

        denied_response = csrf_client.post(reverse("account_logout"), {})

        self.assertEqual(denied_response.status_code, 403)
