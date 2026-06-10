from contextvars import ContextVar
from functools import wraps
import json
import re

from django.http import FileResponse, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.static import serve as static_serve


_request_context = ContextVar("django_request")


class RequestProxy:
    def _current(self):
        return _request_context.get()

    @property
    def form(self):
        return self._current().POST

    def __getattr__(self, item):
        return getattr(self._current(), item)


request = RequestProxy()


def django_view(view_func):
    @wraps(view_func)
    def wrapped(django_request, *args, **kwargs):
        token = _request_context.set(django_request)
        try:
            return view_func(*args, **kwargs)
        finally:
            _request_context.reset(token)

    return wrapped


def add_json_context(context):
    for key in ("pre_code", "pre_lang", "pre_theme", "pre_project", "share_project_id"):
        context[f"{key}_json"] = (
            json.dumps(context.get(key), ensure_ascii=False)
            .replace("<", "\\u003C")
            .replace(">", "\\u003E")
            .replace("&", "\\u0026")
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029")
        )
    return context


def render_page(template_name, **context):
    add_json_context(context)
    return render(request._current(), template_name, context)


def jsonify(payload):
    return JsonResponse(payload, json_dumps_params={"ensure_ascii": False})


def build_url(endpoint, _external=False, _scheme=None, **values):
    path = reverse(endpoint, kwargs=values)
    if not _external:
        return path
    absolute_url = request._current().build_absolute_uri(path)
    if _scheme:
        absolute_url = re.sub(r"^https?", _scheme, absolute_url, count=1)
    return absolute_url


def send_file(file_obj, mimetype=None, as_attachment=False, download_name=None):
    return FileResponse(
        file_obj,
        as_attachment=as_attachment,
        filename=download_name,
        content_type=mimetype,
    )


def send_from_directory(directory, path):
    return static_serve(request._current(), path, document_root=directory)
