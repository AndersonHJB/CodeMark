import json

from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from apps.common.project_payload import DEFAULT_CODE_THEME
from apps.common.responsive import is_mobile_request
from apps.common.runtime import django_view, jsonify, render_page, request

from .services import (
    compile_and_run_cpp,
    poll_interactive_cpp_run,
    send_interactive_cpp_stdin,
    start_interactive_cpp_run,
    stop_interactive_cpp_run,
)


def _parse_project_payload(raw_payload):
    if not raw_payload:
        return None
    try:
        parsed_payload = json.loads(raw_payload)
    except Exception:
        return None
    return parsed_payload if isinstance(parsed_payload, dict) else None


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
        project_payload=_parse_project_payload(request.form.get("project_payload", "")),
        active_file=request.form.get("active_file", ""),
    )
    return jsonify(result)


@require_POST
@django_view
def start_cpp_run():
    result = start_interactive_cpp_run(
        request.form.get("code", ""),
        project_payload=_parse_project_payload(request.form.get("project_payload", "")),
        active_file=request.form.get("active_file", ""),
    )
    return jsonify(result)


@require_POST
@django_view
def poll_cpp_run():
    result = poll_interactive_cpp_run(
        request.form.get("session_id", ""),
        request.form.get("after_seq", "0"),
    )
    return jsonify(result)


@require_POST
@django_view
def send_cpp_run_input():
    result = send_interactive_cpp_stdin(
        request.form.get("session_id", ""),
        request.form.get("stdin", ""),
    )
    return jsonify(result)


@require_POST
@django_view
def stop_cpp_run():
    return jsonify(stop_interactive_cpp_run(request.form.get("session_id", "")))
