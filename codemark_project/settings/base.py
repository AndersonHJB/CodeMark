import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONTENT_DIR = BASE_DIR / "content"
LOGS_DIR = BASE_DIR / "logs"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "codemark-local-development-key")
DEBUG = os.getenv("DJANGO_DEBUG", "1") != "0"

allowed_hosts = os.getenv("DJANGO_ALLOWED_HOSTS", "*")
ALLOWED_HOSTS = [host.strip() for host in allowed_hosts.split(",") if host.strip()]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "apps.articles.apps.ArticlesConfig",
    "apps.editor.apps.EditorConfig",
    "apps.sharing.apps.SharingConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
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

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [TEMPLATES_DIR],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    },
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

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
