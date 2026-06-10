from django.test import SimpleTestCase
from django.urls import resolve, reverse

from . import views


class EditorUrlPatternTests(SimpleTestCase):
    def test_editor_route_keeps_existing_name_and_path(self):
        self.assertIs(resolve(reverse("editor")).func, views.editor)
