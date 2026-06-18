from django.test import SimpleTestCase
from django.template.loader import render_to_string
from django.urls import resolve, reverse

from . import views


class EditorUrlPatternTests(SimpleTestCase):
    def test_editor_route_keeps_existing_name_and_path(self):
        self.assertIs(resolve(reverse("editor")).func, views.editor)


class SiteTopbarEditorMenuTests(SimpleTestCase):
    def test_editor_nav_renders_hover_dropdown_group(self):
        html = render_to_string(
            "_site_topbar.html",
            {
                "active_nav": "cpp_editor",
                "show_search": False,
                "show_account": False,
                "brand_logo": "images/logo-cm.svg",
            },
        )

        self.assertIn('class="site-nav-group is-active"', html)
        self.assertIn('class="site-nav-dropdown"', html)
        self.assertIn('href="/editor"', html)
        self.assertIn('href="/cpp-editor"', html)
        self.assertIn("editor.html", html)
        self.assertIn("cpp_editor.html", html)
