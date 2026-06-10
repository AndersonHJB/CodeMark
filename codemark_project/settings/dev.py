import os

from .base import *


DEBUG = os.getenv("DJANGO_DEBUG", "1") != "0"
