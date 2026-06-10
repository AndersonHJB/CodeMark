import os

from .base import *


DEBUG = os.getenv("DJANGO_DEBUG", "0") == "1"

if SECRET_KEY == "codemark-local-development-key":
    raise RuntimeError("DJANGO_SECRET_KEY must be set in production.")
