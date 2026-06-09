from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from django.urls import reverse
from jinja2 import Environment, pass_context


@pass_context
def url_for(context, endpoint, **values):
    external = values.pop("_external", False)
    scheme = values.pop("_scheme", None)
    values.pop("_anchor", None)
    values.pop("_method", None)

    if endpoint == "static":
        filename = str(values.get("filename", "")).lstrip("/")
        static_url = settings.STATIC_URL
        if not static_url.startswith("/"):
            static_url = "/" + static_url
        url = f"{static_url.rstrip('/')}/{filename}" if filename else static_url
    else:
        url = reverse(endpoint, kwargs=values)

    request = context.get("request")
    if external and request is not None:
        url = request.build_absolute_uri(url)
        if scheme:
            parsed = urlsplit(url)
            url = urlunsplit((scheme, parsed.netloc, parsed.path, parsed.query, parsed.fragment))

    return url


def environment(**options):
    env = Environment(**options)
    env.globals.update(url_for=url_for)
    return env
