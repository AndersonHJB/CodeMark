from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from apps.common.project_payload import DEFAULT_CODE_THEME
from apps.common.responsive import is_mobile_request
from apps.common.runtime import django_view, jsonify, render_page, request

from .services import compile_and_run_cpp


@ensure_csrf_cookie
@django_view
def cpp_editor():
    return render_page(
        "cpp_editor.html",
        pre_code="",
        pre_lang="c_cpp",
        pre_theme=DEFAULT_CODE_THEME,
        pre_project=None,
        share_project_id="",
        is_mobile=is_mobile_request(),
    )


@require_POST
@django_view
def run_cpp():
    result = compile_and_run_cpp(
        request.form.get("code", ""),
        request.form.get("stdin", ""),
    )
    return jsonify(result)
