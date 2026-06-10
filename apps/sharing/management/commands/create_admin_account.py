import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils.crypto import get_random_string


class Command(BaseCommand):
    help = "Create or update a CodeMark administrator account."

    def add_arguments(self, parser):
        parser.add_argument("--username", default=os.getenv("CODEMARK_ADMIN_USERNAME", "admin"))
        parser.add_argument("--email", default=os.getenv("CODEMARK_ADMIN_EMAIL", ""))
        parser.add_argument("--password", default=os.getenv("CODEMARK_ADMIN_PASSWORD", ""))
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="Reset the password when the account already exists.",
        )

    def handle(self, *args, **options):
        username = (options["username"] or "").strip()
        email = (options["email"] or "").strip()
        password = options["password"] or ""
        reset_password = options["reset_password"]

        if not username:
            raise CommandError("Admin username cannot be empty.")

        generated_password = False
        if not password:
            password = get_random_string(24)
            generated_password = True

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )

        changed_fields = []
        if not user.is_staff:
            user.is_staff = True
            changed_fields.append("is_staff")
        if not user.is_superuser:
            user.is_superuser = True
            changed_fields.append("is_superuser")
        if not user.is_active:
            user.is_active = True
            changed_fields.append("is_active")
        if email and user.email != email:
            user.email = email
            changed_fields.append("email")

        if created or reset_password:
            user.set_password(password)
            changed_fields.append("password")
        elif generated_password:
            password = ""

        if changed_fields:
            user.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created admin account: {username}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Admin account is ready: {username}"))

        if password:
            self.stdout.write(f"Password: {password}")
        else:
            self.stdout.write("Password unchanged. Use --reset-password to change it.")
