from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse


ALLOWED_TAGS = {
    "a",
    "blockquote",
    "br",
    "code",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "hr",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
}
VOID_TAGS = {"br", "hr", "img"}
ALLOWED_ATTRS = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title"},
    "th": {"align"},
    "td": {"align"},
}
SAFE_URL_SCHEMES = {"http", "https", "mailto", ""}


def _safe_url(value, image=False):
    value = (value or "").strip()
    if not value:
        return False
    parsed = urlparse(value)
    if parsed.scheme not in SAFE_URL_SCHEMES:
        return False
    if image and parsed.scheme == "mailto":
        return False
    return True


def _safe_align(value):
    return (value or "").strip().lower() in {"left", "right", "center"}


class _Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag not in ALLOWED_TAGS:
            return
        clean_attrs = []
        allowed_attrs = ALLOWED_ATTRS.get(tag, set())
        for name, value in attrs:
            name = (name or "").lower()
            value = value or ""
            if name not in allowed_attrs or name.startswith("on"):
                continue
            if tag == "a" and name == "href" and not _safe_url(value):
                continue
            if tag == "img" and name == "src" and not _safe_url(value, image=True):
                continue
            if name == "align" and not _safe_align(value):
                continue
            clean_attrs.append(f'{name}="{escape(value, quote=True)}"')
        if tag == "a":
            clean_attrs.append('rel="nofollow noopener noreferrer"')
            clean_attrs.append('target="_blank"')
        attr_text = f" {' '.join(clean_attrs)}" if clean_attrs else ""
        self.parts.append(f"<{tag}{attr_text}>")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ALLOWED_TAGS and tag not in VOID_TAGS:
            self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        self.parts.append(escape(data))

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")


def sanitize_rich_text(value):
    parser = _Sanitizer()
    parser.feed(value or "")
    parser.close()
    return "".join(parser.parts)
