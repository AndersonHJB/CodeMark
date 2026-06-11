import json

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
    project_payload_raw = request.form.get("project_payload", "")
    project_payload = None
    if project_payload_raw:
        try:
            parsed_payload = json.loads(project_payload_raw)
            if isinstance(parsed_payload, dict):
                project_payload = parsed_payload
        except Exception:
            project_payload = None

    result = compile_and_run_cpp(
        request.form.get("code", ""),
        request.form.get("stdin", ""),
        project_payload=project_payload,
        active_file=request.form.get("active_file", ""),
    )
    return jsonify(result)
