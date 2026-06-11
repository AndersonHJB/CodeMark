import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONTENT_DIR = BASE_DIR / "content"
LOGS_DIR = BASE_DIR / "logs"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "codemark-local-development-key")
DEBUG = os.getenv("DJANGO_DEBUG", "1") != "0"


def env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


allowed_hosts = os.getenv("DJANGO_ALLOWED_HOSTS", "*")
ALLOWED_HOSTS = [host.strip() for host in allowed_hosts.split(",") if host.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.articles.apps.ArticlesConfig",
    "apps.editor.apps.EditorConfig",
    "apps.cpp_editor.apps.CppEditorConfig",
    "apps.sharing.apps.SharingConfig",
    "apps.algorithms.apps.AlgorithmsConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "codemark_project.urls"
WSGI_APPLICATION = "codemark_project.wsgi.application"
ASGI_APPLICATION = "codemark_project.asgi.application"

TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
CODEMARK_ARTICLES_DIR = CONTENT_DIR / "articles"
CODEMARK_SHARECODE_DIR = MEDIA_ROOT / "sharecode"
DATA_UPLOAD_MAX_MEMORY_SIZE = env_int("DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE", 50 * 1024 * 1024)
CPP_EDITOR_COMPILE_TIMEOUT_SECONDS = env_int("CPP_EDITOR_COMPILE_TIMEOUT_SECONDS", 12)
CPP_EDITOR_RUN_TIMEOUT_SECONDS = env_int("CPP_EDITOR_RUN_TIMEOUT_SECONDS", 3)
CPP_EDITOR_INTERACTIVE_RUN_TIMEOUT_SECONDS = env_int("CPP_EDITOR_INTERACTIVE_RUN_TIMEOUT_SECONDS", 60)
CPP_EDITOR_MAX_CODE_BYTES = env_int("CPP_EDITOR_MAX_CODE_BYTES", 100 * 1024)
CPP_EDITOR_MAX_STDIN_BYTES = env_int("CPP_EDITOR_MAX_STDIN_BYTES", 32 * 1024)
CPP_EDITOR_MAX_OUTPUT_BYTES = env_int("CPP_EDITOR_MAX_OUTPUT_BYTES", 64 * 1024)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.getenv("DJANGO_SQLITE_PATH", BASE_DIR / "db.sqlite3"),
    }
}

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [TEMPLATES_DIR],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True
LOGIN_URL = "/admin/login/"
LOGIN_REDIRECT_URL = "/admin/share-files/"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[{levelname}] {asctime} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
        "file": {
            "class": "logging.FileHandler",
            "filename": LOGS_DIR / "django.log",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console", "file"],
        "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
    },
}
