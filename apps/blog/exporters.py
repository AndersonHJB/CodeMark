import html
import posixpath
import re
import tempfile
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.conf import settings
from django.contrib.staticfiles import finders
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.text import slugify

from .models import BlogPost


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov", ".m4v"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}

MARKDOWN_IMAGE_RE = re.compile(
    r"!\[[^\]]*\]\("
    r"(?P<target><[^>]+>|[^)\s]+)"
    r"(?:\s+(?P<title>\"[^\"]*\"|'[^']*'|\([^)]*\)))?"
    r"\)"
)
MARKDOWN_LINK_RE = re.compile(
    r"(?<!!)\[(?P<label>[^\]]+)\]\("
    r"(?P<target><[^>]+>|[^)\s]+)"
    r"(?:\s+(?P<title>\"[^\"]*\"|'[^']*'|\([^)]*\)))?"
    r"\)"
)
HTML_IMG_RE = re.compile(r"<img\b[^>]*\bsrc=(?P<quote>['\"])(?P<src>.*?)(?P=quote)[^>]*>", re.IGNORECASE | re.DOTALL)
HTML_MEDIA_RE = re.compile(
    r"<(?P<tag>video|audio)\b[^>]*\bsrc=(?P<quote>['\"])(?P<src>.*?)(?P=quote)[^>]*>"
    r"(?:.*?</(?P=tag)>)?",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class LocalAsset:
    key: str
    name: str
    path: Path | None = None
    storage: object | None = None
    storage_name: str = ""


def build_blog_posts_markdown_archive(posts):
    archive = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip_file:
        write_posts_to_markdown_zip(zip_file, posts)
    archive.seek(0)
    return archive


def build_blog_export_filename():
    stamp = timezone.localtime(timezone.now()).strftime("%Y%m%d-%H%M%S")
    return f"codemark-blog-markdown-{stamp}.zip"


def write_posts_to_markdown_zip(zip_file, posts):
    used_bases = set()
    for index, post in enumerate(_ordered_posts(posts), start=0):
        base_name = _unique_name(_post_base_name(post, index), used_bases)
        exporter = PostMarkdownExporter(zip_file, post, base_name)
        exporter.write()


def _ordered_posts(posts):
    if hasattr(posts, "order_by"):
        return posts.order_by("created_at", "pk")
    return sorted(posts, key=lambda post: (post.created_at, post.pk or 0))


def _post_base_name(post, index):
    source = post.slug or post.title or f"post-{post.pk}"
    slug = _safe_stem(source, fallback=f"post-{post.pk or index}")
    return f"{index:02d}-{slug}"[:110].rstrip(".-") or f"{index:02d}-post"


def _unique_name(name, used_names):
    candidate = name
    suffix = 2
    while candidate in used_names:
        candidate = f"{name}-{suffix}"
        suffix += 1
    used_names.add(candidate)
    return candidate


def _safe_stem(value, fallback="file"):
    stem = slugify(str(value or ""), allow_unicode=True).strip(".-_")
    if not stem:
        stem = fallback
    stem = re.sub(r"[^\w.\-\u4e00-\u9fff]+", "-", stem, flags=re.UNICODE).strip(".-_")
    return stem[:90].strip(".-_") or fallback


def _safe_asset_filename(filename, fallback):
    raw_name = Path(unquote(filename or "")).name
    suffix = Path(raw_name).suffix.lower()
    suffix = re.sub(r"[^a-z0-9.]+", "", suffix)[:16]
    stem = _safe_stem(Path(raw_name).stem, fallback=fallback)
    return f"{stem[:80]}{suffix or '.bin'}"


def _target_value(raw_target):
    target = (raw_target or "").strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()
    return target


def _markdown_target(value):
    if re.search(r"[\s()]", value):
        return f"<{value}>"
    return value


def _is_image_reference(target):
    return Path(urlparse(_target_value(target)).path).suffix.lower() in IMAGE_EXTENSIONS


def _relative_name_from_url(url, base_url):
    parsed = urlparse(url)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return ""
    path = unquote(parsed.path or "")
    base_path = urlparse(base_url or "").path or base_url or ""
    if not base_path.startswith("/"):
        base_path = f"/{base_path}"
    if not base_path.endswith("/"):
        base_path = f"{base_path}/"
    if path.startswith(base_path):
        relative = path[len(base_path) :]
    elif not parsed.scheme and not parsed.netloc and path.lstrip("/").startswith(base_path.lstrip("/")):
        relative = path.lstrip("/")[len(base_path.lstrip("/")) :]
    else:
        return ""
    relative = posixpath.normpath(relative).lstrip("/")
    if not relative or relative == "." or relative.startswith("../"):
        return ""
    return relative


def _resolve_local_asset(url):
    target = _target_value(url)
    if not target:
        return None

    media_name = _relative_name_from_url(target, settings.MEDIA_URL)
    if media_name and default_storage.exists(media_name):
        return LocalAsset(
            key=f"media:{media_name}",
            name=Path(media_name).name,
            storage=default_storage,
            storage_name=media_name,
        )

    static_name = _relative_name_from_url(target, settings.STATIC_URL)
    if static_name:
        static_path = finders.find(static_name)
        if static_path:
            return LocalAsset(key=f"static:{static_name}", name=Path(static_name).name, path=Path(static_path))

    return None


class AssetCollector:
    def __init__(self, zip_file, asset_dir):
        self.zip_file = zip_file
        self.asset_dir = asset_dir
        self.copied_by_key = {}
        self.used_filenames = set()
        self.zip_file.writestr(f"{self.asset_dir}/", "")

    def add_url(self, url):
        asset = _resolve_local_asset(url)
        if not asset:
            return ""
        return self._add_asset(asset)

    def add_field_file(self, field_file, preferred_name=""):
        if not field_file:
            return ""
        try:
            storage_name = field_file.name
        except ValueError:
            return ""
        if not storage_name:
            return ""
        asset = LocalAsset(
            key=f"field:{field_file.storage.__class__.__name__}:{storage_name}",
            name=preferred_name or Path(storage_name).name,
            storage=field_file.storage,
            storage_name=storage_name,
        )
        return self._add_asset(asset)

    def _add_asset(self, asset):
        if asset.key in self.copied_by_key:
            return self.copied_by_key[asset.key]

        fallback = f"asset-{len(self.used_filenames) + 1}"
        filename = _unique_asset_filename(_safe_asset_filename(asset.name, fallback), self.used_filenames)
        archive_name = f"{self.asset_dir}/{filename}"

        if asset.path:
            with asset.path.open("rb") as file_obj:
                self.zip_file.writestr(archive_name, file_obj.read())
        elif asset.storage and asset.storage_name:
            if not asset.storage.exists(asset.storage_name):
                return ""
            with asset.storage.open(asset.storage_name, "rb") as file_obj:
                self.zip_file.writestr(archive_name, file_obj.read())
        else:
            return ""

        local_ref = f"./{archive_name}"
        self.copied_by_key[asset.key] = local_ref
        return local_ref


def _unique_asset_filename(filename, used_filenames):
    candidate = filename
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    index = 2
    while candidate in used_filenames:
        candidate = f"{stem}-{index}{suffix}"
        index += 1
    used_filenames.add(candidate)
    return candidate


class PostMarkdownExporter:
    def __init__(self, zip_file, post, base_name):
        self.zip_file = zip_file
        self.post = post
        self.base_name = base_name
        self.asset_dir = f"{base_name}.assets"
        self.assets = AssetCollector(zip_file, self.asset_dir)

    def write(self):
        body = self._export_body()
        cover_ref = self._export_cover()
        markdown_text = self._compose_markdown(body, cover_ref)
        self.zip_file.writestr(f"{self.base_name}.md", markdown_text)

    def _export_body(self):
        if self.post.content_format == BlogPost.FORMAT_RICH_TEXT:
            return html_to_markdown(self.post.content or "", self.assets).strip()
        return rewrite_markdown_asset_references(self.post.content or "", self.assets).strip()

    def _export_cover(self):
        if not self.post.cover_image:
            return ""
        extension = Path(self.post.cover_image.name).suffix.lower() or ".bin"
        return self.assets.add_field_file(self.post.cover_image, preferred_name=f"cover{extension}")

    def _compose_markdown(self, body, cover_ref):
        lines = [f"# {self.post.title.strip()}", ""]
        meta_parts = [
            f"作者：{self.post.author.get_username()}",
            f"状态：{self.post.display_status}",
        ]
        if self.post.published_at:
            meta_parts.append(f"发布时间：{timezone.localtime(self.post.published_at).strftime('%Y-%m-%d %H:%M')}")
        meta_parts.append(f"更新时间：{timezone.localtime(self.post.updated_at).strftime('%Y-%m-%d %H:%M')}")
        if self.post.category:
            meta_parts.append(f"分类：{self.post.category}")
        lines.append("> " + " · ".join(meta_parts))
        lines.append("")
        if cover_ref:
            lines.extend([f"![]({_markdown_target(cover_ref)})", ""])
        if body:
            lines.append(body)
            lines.append("")
        return "\n".join(lines)


def rewrite_markdown_asset_references(markdown_text, assets):
    text = MARKDOWN_IMAGE_RE.sub(lambda match: _replace_markdown_image(match, assets), markdown_text)
    text = MARKDOWN_LINK_RE.sub(lambda match: _replace_markdown_link(match, assets), text)
    text = HTML_IMG_RE.sub(lambda match: _replace_html_image(match, assets), text)
    text = HTML_MEDIA_RE.sub(lambda match: _replace_html_media(match, assets), text)
    return text


def _replace_markdown_image(match, assets):
    local_ref = assets.add_url(match.group("target"))
    if not local_ref:
        return match.group(0)
    return f"![]({_markdown_target(local_ref)})"


def _replace_markdown_link(match, assets):
    local_ref = assets.add_url(match.group("target"))
    if not local_ref:
        return match.group(0)
    label = match.group("label")
    if _is_image_reference(match.group("target")):
        return f"![]({_markdown_target(local_ref)})"
    return f"[{label}]({_markdown_target(local_ref)})"


def _replace_html_image(match, assets):
    local_ref = assets.add_url(match.group("src"))
    if not local_ref:
        return match.group(0)
    return f"![]({_markdown_target(local_ref)})"


def _replace_html_media(match, assets):
    local_ref = assets.add_url(match.group("src"))
    if not local_ref:
        return match.group(0)
    tag = match.group("tag").lower()
    escaped_ref = html.escape(local_ref, quote=True)
    return f'<{tag} controls src="{escaped_ref}"></{tag}>'


def html_to_markdown(html_text, assets):
    parser = RichTextMarkdownConverter(assets)
    parser.feed(html_text or "")
    parser.close()
    return parser.result()


class RichTextMarkdownConverter(HTMLParser):
    def __init__(self, assets):
        super().__init__(convert_charrefs=True)
        self.assets = assets
        self.parts = []
        self.list_stack = []
        self.link_stack = []
        self.heading_stack = []
        self.media_stack = []
        self.skip_depth = 0
        self.in_pre = False

    def result(self):
        text = "".join(self.parts)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attr_map = dict(attrs)
        if tag in {"script", "style"}:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if self.media_stack:
            self._handle_nested_media_tag(tag, attr_map)
            return
        if tag in {"p", "div", "section", "article"}:
            self._blank_line()
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            level = int(tag[1])
            self.heading_stack.append(level)
            self._blank_line()
            self.parts.append(f"{'#' * level} ")
        elif tag == "br":
            self.parts.append("\n")
        elif tag in {"strong", "b"}:
            self.parts.append("**")
        elif tag in {"em", "i"}:
            self.parts.append("*")
        elif tag == "code" and not self.in_pre:
            self.parts.append("`")
        elif tag == "pre":
            self._blank_line()
            self.parts.append("```\n")
            self.in_pre = True
        elif tag == "blockquote":
            self._blank_line()
            self.parts.append("> ")
        elif tag in {"ul", "ol"}:
            self.list_stack.append({"tag": tag, "index": 1})
            self._blank_line()
        elif tag == "li":
            prefix = "- "
            if self.list_stack and self.list_stack[-1]["tag"] == "ol":
                prefix = f"{self.list_stack[-1]['index']}. "
                self.list_stack[-1]["index"] += 1
            self.parts.append("  " * max(0, len(self.list_stack) - 1) + prefix)
        elif tag == "a":
            href = self._local_or_original_ref(attr_map.get("href", ""))
            self.link_stack.append(href)
            self.parts.append("[")
        elif tag == "img":
            local_ref = self.assets.add_url(attr_map.get("src", ""))
            if local_ref:
                self._blank_line()
                self.parts.append(f"![]({_markdown_target(local_ref)})")
                self._blank_line()
        elif tag in {"video", "audio"}:
            self.media_stack.append({"tag": tag, "emitted": False})
            self._emit_media(tag, attr_map.get("src", ""))

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"script", "style"}:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        if self.media_stack:
            if tag == self.media_stack[-1]["tag"]:
                self.media_stack.pop()
                self._blank_line()
            return
        if tag in {"p", "div", "section", "article", "blockquote"}:
            self._blank_line()
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            if self.heading_stack:
                self.heading_stack.pop()
            self._blank_line()
        elif tag in {"strong", "b"}:
            self.parts.append("**")
        elif tag in {"em", "i"}:
            self.parts.append("*")
        elif tag == "code" and not self.in_pre:
            self.parts.append("`")
        elif tag == "pre":
            self.parts.append("\n```")
            self.in_pre = False
            self._blank_line()
        elif tag in {"ul", "ol"}:
            if self.list_stack:
                self.list_stack.pop()
            self._blank_line()
        elif tag == "li":
            self.parts.append("\n")
        elif tag == "a":
            href = self.link_stack.pop() if self.link_stack else ""
            self.parts.append(f"]({_markdown_target(href)})" if href else "]()")

    def handle_data(self, data):
        if self.skip_depth or self.media_stack:
            return
        if self.in_pre:
            self.parts.append(data)
            return
        value = re.sub(r"\s+", " ", data)
        if value:
            self.parts.append(value)

    def _handle_nested_media_tag(self, tag, attrs):
        if tag == "source" and self.media_stack and not self.media_stack[-1]["emitted"]:
            self._emit_media(self.media_stack[-1]["tag"], attrs.get("src", ""))

    def _emit_media(self, tag, src):
        local_ref = self.assets.add_url(src)
        if not local_ref:
            return
        escaped_ref = html.escape(local_ref, quote=True)
        self._blank_line()
        self.parts.append(f'<{tag} controls src="{escaped_ref}"></{tag}>')
        self.media_stack[-1]["emitted"] = True

    def _local_or_original_ref(self, ref):
        if not ref:
            return ""
        local_ref = self.assets.add_url(ref)
        return local_ref or ref

    def _blank_line(self):
        current = "".join(self.parts)
        if not current:
            return
        if current.endswith("\n\n"):
            return
        if current.endswith("\n"):
            self.parts.append("\n")
        else:
            self.parts.append("\n\n")
