import io
import json
import os
import re
import tempfile
from urllib.parse import unquote, urlparse

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from PIL import Image

from .avatars import DEFAULT_AVATAR_STATIC_PATHS
from .models import AccountLoginSettings, EmailVerificationCode, UserProfile
from .random_profiles import DEFAULT_BIOS, DEFAULT_NICKNAMES
from .views import MAX_AVATAR_BYTES


TINY_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def post_json(client, url_name, payload):
    return client.post(
        reverse(url_name),
        data=json.dumps(payload),
        content_type="application/json",
    )


def noisy_png_upload(name="large-avatar.png", size=(1200, 1200)):
    image = Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")


def tiny_png_upload(name="avatar.png"):
    return SimpleUploadedFile(name, TINY_PNG_BYTES, content_type="image/png")


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

    def test_login_by_username_password(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="username-login-user",
            email="username-login@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="用户名登录用户")

        response = post_json(
            self.client,
            "account_login",
            {
                "login_method": AccountLoginSettings.METHOD_USERNAME_PASSWORD,
                "username": "username-login-user",
                "password": "test-password",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["display_name"], "用户名登录用户")

    def test_login_by_email_code(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="email-code-login-user",
            email="email-code-login@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="验证码登录用户")

        code_response = post_json(
            self.client,
            "account_send_code",
            {
                "purpose": EmailVerificationCode.PURPOSE_LOGIN,
                "email": "email-code-login@example.com",
            },
        )

        self.assertEqual(code_response.status_code, 200)
        self.assertEqual(mail.outbox[-1].subject, "CodeMark 登录验证码")
        self.assertEqual(mail.outbox[-1].to, ["email-code-login@example.com"])
        code = re.search(r"(\d{6})", mail.outbox[-1].body).group(1)

        response = post_json(
            self.client,
            "account_login",
            {
                "login_method": AccountLoginSettings.METHOD_EMAIL_CODE,
                "email": "email-code-login@example.com",
                "code": code,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["display_name"], "验证码登录用户")
        self.assertTrue(
            EmailVerificationCode.objects.get(
                email="email-code-login@example.com",
                purpose=EmailVerificationCode.PURPOSE_LOGIN,
            ).is_used
        )

    def test_disabled_login_methods_are_rejected_by_api(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="method-limited-user",
            email="method-limited@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="受限登录用户")
        settings = AccountLoginSettings.load()
        settings.enable_email_password = False
        settings.enable_email_code = False
        settings.enable_username_password = True
        settings.save()

        email_password_response = post_json(
            self.client,
            "account_login",
            {
                "login_method": AccountLoginSettings.METHOD_EMAIL_PASSWORD,
                "email": "method-limited@example.com",
                "password": "test-password",
            },
        )
        email_code_response = post_json(
            self.client,
            "account_send_code",
            {
                "purpose": EmailVerificationCode.PURPOSE_LOGIN,
                "email": "method-limited@example.com",
            },
        )
        username_response = post_json(
            self.client,
            "account_login",
            {
                "login_method": AccountLoginSettings.METHOD_USERNAME_PASSWORD,
                "username": "method-limited-user",
                "password": "test-password",
            },
        )

        self.assertEqual(email_password_response.status_code, 403)
        self.assertIn("暂未开启", email_password_response.json()["message"])
        self.assertEqual(email_code_response.status_code, 403)
        self.assertIn("暂未开启", email_code_response.json()["message"])
        self.assertEqual(username_response.status_code, 200)

    def test_session_payload_exposes_membership_status(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="vip-session-user",
            email="vip-session@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="VIP 用户", is_permanent_vip=True)
        self.client.force_login(user)

        response = self.client.get(reverse("account_session"))

        payload = response.json()["user"]
        self.assertEqual(payload["membership_tier"], "permanent-vip")
        self.assertEqual(payload["membership_label"], "永久 VIP")
        self.assertEqual(payload["can_use_article_api"], True)

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
                profile = UserProfile.objects.get(user=user)
                self.assertTrue(profile.avatar)
                self.assertTrue(profile.original_avatar)
                self.assertIn("accounts/avatars/", profile.avatar.name)
                self.assertIn("accounts/original_avatars/", profile.original_avatar.name)

    def test_profile_avatar_upload_saves_original_and_uses_compressed_copy(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                User = get_user_model()
                user = User.objects.create_user(
                    username="large-avatar-user",
                    email="large-avatar@example.com",
                    password="test-password",
                )
                self.client.force_login(user)
                avatar = noisy_png_upload()
                self.assertGreater(avatar.size, MAX_AVATAR_BYTES)

                response = self.client.post(
                    reverse("account_profile"),
                    data={"display_name": "大图用户", "bio": "上传大图", "avatar": avatar},
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertEqual(payload["ok"], True)
                self.assertIn("/media/accounts/avatars/", payload["user"]["avatar_url"])
                profile = UserProfile.objects.get(user=user)
                self.assertTrue(profile.avatar)
                self.assertTrue(profile.original_avatar)
                self.assertIn("accounts/avatars/", profile.avatar.name)
                self.assertIn("accounts/original_avatars/", profile.original_avatar.name)
                self.assertGreater(profile.original_avatar.size, MAX_AVATAR_BYTES)
                self.assertLess(profile.avatar.size, profile.original_avatar.size)
                self.assertLessEqual(profile.avatar.size, MAX_AVATAR_BYTES)
                with Image.open(profile.avatar.path) as compressed_image:
                    self.assertLessEqual(max(compressed_image.size), 512)

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

    def test_profile_email_change_requires_old_and_new_email_codes(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="email-change-user",
            email="old@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="邮箱用户")
        self.client.force_login(user)

        old_code_response = post_json(
            self.client,
            "account_send_code",
            {"purpose": EmailVerificationCode.PURPOSE_EMAIL_CHANGE_OLD},
        )
        new_code_response = post_json(
            self.client,
            "account_send_code",
            {"purpose": EmailVerificationCode.PURPOSE_EMAIL_CHANGE_NEW, "email": "new@example.com"},
        )

        self.assertEqual(old_code_response.status_code, 200)
        self.assertEqual(new_code_response.status_code, 200)
        self.assertEqual(mail.outbox[-2].to, ["old@example.com"])
        self.assertEqual(mail.outbox[-2].subject, "CodeMark 原邮箱验证码")
        self.assertEqual(mail.outbox[-1].to, ["new@example.com"])
        self.assertEqual(mail.outbox[-1].subject, "CodeMark 新邮箱验证码")
        old_code = re.search(r"(\d{6})", mail.outbox[-2].body).group(1)
        new_code = re.search(r"(\d{6})", mail.outbox[-1].body).group(1)

        missing_old_response = self.client.post(
            reverse("account_profile"),
            data={"new_email": "new@example.com", "new_email_code": new_code},
        )
        self.assertEqual(missing_old_response.status_code, 400)
        self.assertEqual(missing_old_response.json()["field"], "current_email_code")

        change_response = self.client.post(
            reverse("account_profile"),
            data={
                "display_name": "邮箱用户",
                "bio": "修改邮箱",
                "new_email": "new@example.com",
                "current_email_code": old_code,
                "new_email_code": new_code,
            },
        )

        self.assertEqual(change_response.status_code, 200)
        payload = change_response.json()
        self.assertEqual(payload["message"], "邮箱已更新")
        self.assertEqual(payload["user"]["email"], "new@example.com")
        user.refresh_from_db()
        self.assertEqual(user.email, "new@example.com")
        self.assertTrue(
            EmailVerificationCode.objects.get(
                email="old@example.com",
                purpose=EmailVerificationCode.PURPOSE_EMAIL_CHANGE_OLD,
            ).is_used
        )
        self.assertTrue(
            EmailVerificationCode.objects.get(
                email="new@example.com",
                purpose=EmailVerificationCode.PURPOSE_EMAIL_CHANGE_NEW,
            ).is_used
        )

    def test_profile_email_change_rejects_missing_new_email_code(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="missing-new-code",
            email="old-code@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="旧邮箱用户")
        self.client.force_login(user)

        post_json(
            self.client,
            "account_send_code",
            {"purpose": EmailVerificationCode.PURPOSE_EMAIL_CHANGE_OLD},
        )
        old_code = re.search(r"(\d{6})", mail.outbox[-1].body).group(1)

        response = self.client.post(
            reverse("account_profile"),
            data={
                "new_email": "missing-new@example.com",
                "current_email_code": old_code,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "new_email_code")
        self.assertFalse(
            EmailVerificationCode.objects.get(
                email="old-code@example.com",
                purpose=EmailVerificationCode.PURPOSE_EMAIL_CHANGE_OLD,
            ).is_used
        )

    def test_profile_can_bind_email_without_existing_email_using_new_code(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="bind-email-user",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="绑定邮箱用户")
        self.client.force_login(user)

        code_response = post_json(
            self.client,
            "account_send_code",
            {"purpose": EmailVerificationCode.PURPOSE_EMAIL_CHANGE_NEW, "email": "bind@example.com"},
        )

        self.assertEqual(code_response.status_code, 200)
        code = re.search(r"(\d{6})", mail.outbox[-1].body).group(1)
        response = self.client.post(
            reverse("account_profile"),
            data={"new_email": "bind@example.com", "new_email_code": code},
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.email, "bind@example.com")
        self.assertEqual(response.json()["user"]["email"], "bind@example.com")

    def test_email_change_new_code_rejects_duplicate_email(self):
        User = get_user_model()
        User.objects.create_user(
            username="email-owner",
            email="taken@example.com",
            password="test-password",
        )
        user = User.objects.create_user(
            username="email-claimer",
            email="claimer@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="邮箱占用测试")
        self.client.force_login(user)

        response = post_json(
            self.client,
            "account_send_code",
            {"purpose": EmailVerificationCode.PURPOSE_EMAIL_CHANGE_NEW, "email": "taken@example.com"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["field"], "new_email")
        self.assertEqual(len(mail.outbox), 0)


class AdminAvatarGalleryViewTests(TestCase):
    def test_avatar_gallery_requires_staff_login(self):
        response = self.client.get(reverse("admin_avatar_gallery"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])

    def test_staff_user_can_view_avatar_gallery_and_detail(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                User = get_user_model()
                staff_user = User.objects.create_user(
                    username="avatar-admin",
                    password="test-password",
                    is_staff=True,
                    is_superuser=True,
                )
                avatar_user = User.objects.create_user(
                    username="gallery-user",
                    email="gallery@example.com",
                    password="test-password",
                )
                profile = UserProfile.objects.create(
                    user=avatar_user,
                    display_name="画册用户",
                    avatar=tiny_png_upload("compressed.png"),
                    original_avatar=tiny_png_upload("original.png"),
                )
                client = Client()
                client.force_login(staff_user)

                gallery_response = client.get(reverse("admin_avatar_gallery"))

                self.assertEqual(gallery_response.status_code, 200)
                self.assertContains(gallery_response, "头像画册")
                self.assertContains(gallery_response, "画册用户")
                self.assertContains(gallery_response, "<img", html=False)
                self.assertContains(
                    gallery_response,
                    reverse("admin_avatar_gallery_detail", kwargs={"profile_id": profile.id}),
                )

                detail_response = client.get(
                    reverse("admin_avatar_gallery_detail", kwargs={"profile_id": profile.id})
                )

                self.assertEqual(detail_response.status_code, 200)
                self.assertContains(detail_response, "点击查看原图")
                self.assertContains(detail_response, profile.avatar.url)
                self.assertContains(detail_response, profile.original_avatar.url)

    def test_admin_index_has_avatar_gallery_entry(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="gallery-admin-index",
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        client = Client()
        client.force_login(user)

        response = client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "头像画册")
        self.assertContains(response, reverse("admin:accounts_avatargalleryadminentry_changelist"))

    def test_admin_index_has_login_settings_entry(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="login-settings-admin",
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        client = Client()
        client.force_login(user)

        response = client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "登录方式设置")
        self.assertContains(response, reverse("admin:accounts_accountloginsettings_changelist"))

    def test_avatar_gallery_admin_entry_redirects_to_gallery(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="gallery-admin-entry",
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        client = Client()
        client.force_login(user)

        response = client.get(reverse("admin:accounts_avatargalleryadminentry_changelist"))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], reverse("admin_avatar_gallery"))


class AccountTemplateTests(TestCase):
    def test_editor_sidebar_includes_account_entry(self):
        response = self.client.get(reverse("editor"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-account-trigger', html=False)
        self.assertContains(response, 'data-account-random-profile="display_name"', html=False)
        self.assertContains(response, 'data-account-random-profile="bio"', html=False)
        self.assertContains(response, "randomProfileUrl", html=False)
        self.assertContains(response, "profilePageUrl", html=False)
        self.assertContains(response, reverse("account_profile_page"), html=False)
        html = response.content.decode()
        self.assertIn('data-account-tab="login"', html)
        self.assertIn('data-account-tab="register"', html)
        self.assertNotIn('data-account-tab="profile"', html)
        self.assertNotIn('data-account-use-random-default', html)
        self.assertIn("data-account-open-login data-account-guest-only", html)
        self.assertIn("data-account-open-register data-account-guest-only", html)
        self.assertIn("data-account-profile-link", html)
        self.assertIn("data-account-auth-only", html)

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
        self.assertContains(response, 'data-account-login-panel="password"', html=False)
        self.assertContains(response, "account-login-tags", html=False)
        self.assertContains(response, 'data-account-login-mode="password"', html=False)
        self.assertContains(response, 'data-account-login-mode="email_code"', html=False)
        self.assertNotContains(response, 'data-account-login-mode="email_password"', html=False)
        self.assertNotContains(response, 'data-account-login-mode="username_password"', html=False)
        self.assertContains(response, 'data-account-login-send-code', html=False)
        self.assertContains(response, reverse("account_profile_page"), html=False)
        self.assertContains(response, 'js/accounts.js', html=False)

    def test_algorithms_topbar_includes_account_entry(self):
        response = self.client.get(reverse("algorithms"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "site-account-trigger", html=False)
        self.assertContains(response, 'data-account-open-login data-account-guest-only', html=False)
        self.assertContains(response, 'data-account-tab="login"', html=False)
        self.assertContains(response, reverse("account_profile_page"), html=False)
        self.assertContains(response, 'js/accounts.js', html=False)

    def test_login_dialog_respects_enabled_login_methods(self):
        settings = AccountLoginSettings.load()
        settings.enable_email_password = False
        settings.enable_email_code = False
        settings.enable_username_password = True
        settings.save()

        response = self.client.get(reverse("index"))

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'data-account-login-mode="email_password"', html=False)
        self.assertNotContains(response, 'data-account-login-mode="email_code"', html=False)
        self.assertNotContains(response, 'data-account-login-mode="username_password"', html=False)
        self.assertContains(response, 'data-account-login-panel="password"', html=False)
        self.assertNotContains(response, "account-login-tags", html=False)
        self.assertNotContains(response, 'data-account-login-send-code', html=False)

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
        self.assertNotIn('data-account-tab="profile"', html)
        self.assertIn("data-account-open-login data-account-guest-only hidden", html)
        self.assertIn("data-account-open-register data-account-guest-only hidden", html)
        self.assertIn("data-account-profile-link", html)
        self.assertIn(reverse("account_profile_page"), html)
        self.assertIn("已登录简介", html)

    def test_profile_page_prompts_guest_and_mounts_profile_form(self):
        response = self.client.get(reverse("account_profile_page"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "account-profile-page", html=False)
        self.assertContains(response, "登录后编辑个人资料")
        self.assertContains(response, "data-account-open-login", html=False)
        self.assertContains(response, "data-account-open-register", html=False)
        self.assertContains(response, "data-account-profile-form", html=False)
        self.assertContains(response, "data-account-use-random-default", html=False)
        self.assertContains(response, "data-account-new-email", html=False)
        self.assertContains(response, 'data-account-email-code="email_change_new"', html=False)
        self.assertContains(response, "data-account-auth-only hidden", html=False)
        self.assertContains(response, "js/accounts.js", html=False)

    def test_authenticated_profile_page_renders_profile_editor(self):
        user = get_user_model().objects.create_user(
            username="profile-page-user",
            email="profile-page@example.com",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="资料页用户", bio="资料页简介")
        self.client.force_login(user)

        response = self.client.get(reverse("account_profile_page"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "account-profile-layout", html=False)
        self.assertContains(response, "data-account-guest-only hidden", html=False)
        self.assertContains(response, "data-account-profile-form", html=False)
        self.assertContains(response, "data-account-use-random-default", html=False)
        self.assertContains(response, "data-account-return", html=False)
        self.assertContains(response, "修改邮箱需要同时验证原邮箱和新邮箱")
        self.assertContains(response, 'data-account-email-code="email_change_old"', html=False)
        self.assertContains(response, 'data-account-email-code="email_change_new"', html=False)
        self.assertContains(response, "资料页用户")
        self.assertContains(response, "资料页简介")
        self.assertContains(response, "data-account-email", html=False)
        self.assertContains(response, "profile-page@example.com")
        self.assertContains(response, "profile-page-user")
        self.assertNotContains(response, 'data-account-tab="profile"', html=False)

    def test_profile_page_shows_unbound_email_when_user_has_no_email(self):
        user = get_user_model().objects.create_user(
            username="admin",
            password="test-password",
        )
        UserProfile.objects.create(user=user, display_name="无邮箱用户")
        self.client.force_login(user)

        response = self.client.get(reverse("account_profile_page"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "未绑定邮箱")
        self.assertContains(response, "绑定新邮箱时只需验证新邮箱")
        self.assertContains(response, "data-account-current-email-code-field hidden", html=False)
        self.assertContains(response, 'data-account-email-code="email_change_old"', html=False)
        self.assertContains(response, "admin")
        self.assertNotContains(response, "<dd data-account-email>已登录</dd>", html=False)

    def test_account_menu_shows_distinct_membership_badges(self):
        cases = [
            ("vip-user", {"is_vip": True}, {}, "VIP", "account-vip-badge-vip", "account-vip-icon-vip"),
            ("permanent-user", {"is_permanent_vip": True}, {}, "永久 VIP", "account-vip-badge-permanent-vip", "account-vip-icon-permanent-vip"),
            ("admin-user", {}, {"is_staff": True}, "管理员", "account-vip-badge-admin", "account-vip-icon-admin"),
        ]
        for username, profile_kwargs, user_kwargs, label, css_class, icon_class in cases:
            with self.subTest(label=label):
                user = get_user_model().objects.create_user(
                    username=username,
                    email=f"{username}@example.com",
                    password="test-password",
                    **user_kwargs,
                )
                UserProfile.objects.create(user=user, display_name=label, **profile_kwargs)
                client = Client()
                client.force_login(user)

                response = client.get(reverse("index"))

                self.assertEqual(response.status_code, 200)
                self.assertContains(response, label)
                self.assertContains(response, css_class)
                self.assertContains(response, "account-vip-badge-icon")
                self.assertContains(response, "data-account-vip-label")
                self.assertContains(response, icon_class)
                self.assertContains(response, "VIP API 教程")
                self.assertContains(response, reverse("blog_vip_guide"))

    def test_accounts_api_requires_csrf_when_enforced(self):
        csrf_client = Client(enforce_csrf_checks=True)

        denied_response = csrf_client.post(reverse("account_logout"), {})

        self.assertEqual(denied_response.status_code, 403)
