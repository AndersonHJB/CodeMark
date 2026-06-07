# -*- coding: utf-8 -*-
# @Time    : 2024/11/16 09:07
# @Author  : AI悦创
# @FileName: app.py
# @Software: PyCharm
# @Blog    ：https://bornforthis.cn/
# code is far away from bugs with the god animal protecting
#    I love animals. They taste delicious.
from flask import Flask, render_template, request, jsonify, url_for, send_from_directory, send_file
import markdown
import base64
import io
import json
import os, re, random
import shutil
import uuid
import datetime
import zipfile
import qrcode  # pip install qrcode[pil]

app = Flask(__name__)


# app.config['SERVER_NAME'] = 'codemark.bornforthis.cn'  # 用于生成绝对 URL，可根据实际情况修改
# app.config['PREFERRED_URL_SCHEME'] = 'https' # 强制使用 https

FILENAME_MARKER = "__FILENAME___="
ASSET_MARKER = "__ASSET___="
FOLDER_MARKER = "__FOLDER___="
LINE_HIGHLIGHTS_MARKER = "__LINE_HIGHLIGHTS___="
FILE_LANGUAGE_MARKER = "__FILE_LANG___="
THEME_MARKER = "__THEME__="
DEFAULT_CODE_THEME = "monokai"
CODE_THEMES = {
    "monokai",
    "github",
    "tomorrow",
    "kuroir",
    "twilight",
    "vibrant_ink",
    "xcode",
    "textmate",
    "terminal",
    "solarized_dark",
    "solarized_light",
}

LANGUAGE_FILE_EXTENSIONS = {
    "python": "py",
    "javascript": "js",
    "typescript": "ts",
    "jsx": "jsx",
    "tsx": "tsx",
    "c_cpp": "cpp",
    "java": "java",
    "php": "php",
    "ruby": "rb",
    "golang": "go",
    "html": "html",
    "css": "css",
    "scss": "scss",
    "sass": "sass",
    "less": "less",
    "markdown": "md",
    "json": "json",
    "yaml": "yml",
    "xml": "xml",
    "sql": "sql",
    "sh": "sh",
    "csharp": "cs",
    "rust": "rs",
    "swift": "swift",
    "kotlin": "kt",
    "dart": "dart",
    "lua": "lua",
    "r": "r",
    "perl": "pl",
    "scala": "scala",
    "groovy": "groovy",
    "haskell": "hs",
    "clojure": "clj",
    "elixir": "ex",
    "erlang": "erl",
    "julia": "jl",
    "matlab": "m",
    "objectivec": "mm",
    "powershell": "ps1",
    "dockerfile": "Dockerfile",
    "makefile": "mk",
    "ini": "ini",
    "toml": "toml",
    "diff": "diff",
    "graphql": "gql",
    "terraform": "tf",
    "protobuf": "proto",
    "nginx": "nginx",
    "vue": "vue",
    "plaintext": "txt",
}

EXTENSION_LANGUAGE_MAP = {
    "py": "python",
    "pyw": "python",
    "pyi": "python",
    "js": "javascript",
    "mjs": "javascript",
    "cjs": "javascript",
    "ts": "typescript",
    "mts": "typescript",
    "cts": "typescript",
    "jsx": "jsx",
    "tsx": "tsx",
    "c": "c_cpp",
    "cc": "c_cpp",
    "cpp": "c_cpp",
    "cxx": "c_cpp",
    "h": "c_cpp",
    "hh": "c_cpp",
    "hpp": "c_cpp",
    "hxx": "c_cpp",
    "ino": "c_cpp",
    "java": "java",
    "php": "php",
    "inc": "php",
    "phtml": "php",
    "phps": "php",
    "rb": "ruby",
    "ru": "ruby",
    "gemspec": "ruby",
    "rake": "ruby",
    "go": "golang",
    "html": "html",
    "htm": "html",
    "xhtml": "html",
    "css": "css",
    "scss": "scss",
    "sass": "sass",
    "less": "less",
    "md": "markdown",
    "markdown": "markdown",
    "mdown": "markdown",
    "mkd": "markdown",
    "mkdn": "markdown",
    "json": "json",
    "jsonc": "json",
    "json5": "json",
    "yaml": "yaml",
    "yml": "yaml",
    "xml": "xml",
    "xsd": "xml",
    "xsl": "xml",
    "xslt": "xml",
    "rdf": "xml",
    "rss": "xml",
    "wsdl": "xml",
    "sql": "sql",
    "mysql": "sql",
    "pgsql": "sql",
    "sh": "sh",
    "bash": "sh",
    "zsh": "sh",
    "fish": "sh",
    "ksh": "sh",
    "cs": "csharp",
    "csx": "csharp",
    "rs": "rust",
    "swift": "swift",
    "kt": "kotlin",
    "kts": "kotlin",
    "dart": "dart",
    "lua": "lua",
    "r": "r",
    "rmd": "r",
    "pl": "perl",
    "pm": "perl",
    "pod": "perl",
    "scala": "scala",
    "sbt": "scala",
    "groovy": "groovy",
    "gradle": "groovy",
    "hs": "haskell",
    "lhs": "haskell",
    "clj": "clojure",
    "cljs": "clojure",
    "cljc": "clojure",
    "edn": "clojure",
    "ex": "elixir",
    "exs": "elixir",
    "erl": "erlang",
    "hrl": "erlang",
    "jl": "julia",
    "m": "matlab",
    "mm": "objectivec",
    "ps1": "powershell",
    "psm1": "powershell",
    "psd1": "powershell",
    "dockerfile": "dockerfile",
    "mk": "makefile",
    "mak": "makefile",
    "make": "makefile",
    "ini": "ini",
    "cfg": "ini",
    "prefs": "ini",
    "toml": "toml",
    "diff": "diff",
    "patch": "diff",
    "gql": "graphql",
    "graphql": "graphql",
    "graphqls": "graphql",
    "tf": "terraform",
    "tfvars": "terraform",
    "hcl": "terraform",
    "proto": "protobuf",
    "nginx": "nginx",
    "vue": "vue",
    "txt": "plaintext",
    "text": "plaintext",
    "log": "plaintext",
}

FILENAME_LANGUAGE_MAP = {
    "dockerfile": "dockerfile",
    "makefile": "makefile",
    "gnumakefile": "makefile",
}

MULTI_EXTENSION_LANGUAGE_MAP = {
    "blade.php": "php",
}

LANGUAGE_ALIASES = {
    "py": "python",
    "python3": "python",
    "js": "javascript",
    "node": "javascript",
    "ts": "typescript",
    "react": "jsx",
    "react-ts": "tsx",
    "reacttsx": "tsx",
    "c": "c_cpp",
    "cc": "c_cpp",
    "cpp": "c_cpp",
    "cxx": "c_cpp",
    "c++": "c_cpp",
    "go": "golang",
    "golang": "golang",
    "htm": "html",
    "md": "markdown",
    "yml": "yaml",
    "bash": "sh",
    "shell": "sh",
    "zsh": "sh",
    "fish": "sh",
    "cs": "csharp",
    "c#": "csharp",
    "rs": "rust",
    "kt": "kotlin",
    "kts": "kotlin",
    "rb": "ruby",
    "pl": "perl",
    "objc": "objectivec",
    "obj-c": "objectivec",
    "ps1": "powershell",
    "docker": "dockerfile",
    "make": "makefile",
    "patch": "diff",
    "gql": "graphql",
    "hcl": "terraform",
    "tf": "terraform",
    "proto": "protobuf",
    "txt": "plaintext",
    "text": "plaintext",
    "plain": "plaintext",
}


def normalize_project_relative_path(raw_path: str) -> str:
    """将项目内相对路径规范化，过滤非法层级。"""
    if not isinstance(raw_path, str):
        return ""
    normalized = raw_path.replace("\\", "/").strip()
    if not normalized:
        return ""
    normalized = normalized.lstrip("/")
    normalized = re.sub(r"/{2,}", "/", normalized)
    parts = []
    for part in normalized.split("/"):
        part = part.strip()
        if not part or part == ".":
            continue
        if part == "..":
            return ""
        parts.append(part)
    return "/".join(parts)


def normalize_asset_logical_path(path: str) -> str:
    """Normalize uploaded asset paths while preserving their project location."""
    return normalize_project_relative_path(path)


def detect_language_from_filename(filename: str) -> str:
    safe_name = normalize_project_relative_path(filename)
    if not safe_name:
        return "python"
    basename = os.path.basename(safe_name).lower()
    if basename in FILENAME_LANGUAGE_MAP:
        return FILENAME_LANGUAGE_MAP[basename]
    for suffix, language in MULTI_EXTENSION_LANGUAGE_MAP.items():
        if basename.endswith(f".{suffix}"):
            return language
    if "." not in basename:
        return "python"
    ext = basename.rsplit(".", 1)[1].lower()
    return EXTENSION_LANGUAGE_MAP.get(ext, "python")


def normalize_language(language: str, fallback: str = "python") -> str:
    raw_language = (language or "").strip().lower()
    raw_language = LANGUAGE_ALIASES.get(raw_language, raw_language)
    if raw_language in LANGUAGE_FILE_EXTENSIONS:
        return raw_language
    normalized_fallback = LANGUAGE_ALIASES.get((fallback or "").strip().lower(), (fallback or "").strip().lower())
    return normalized_fallback if normalized_fallback in LANGUAGE_FILE_EXTENSIONS else "python"


def normalize_theme(theme: str, fallback: str = DEFAULT_CODE_THEME) -> str:
    raw_theme = (theme or "").strip()
    if raw_theme in CODE_THEMES:
        return raw_theme
    normalized_fallback = (fallback or "").strip()
    return normalized_fallback if normalized_fallback in CODE_THEMES else DEFAULT_CODE_THEME


def default_filename_for_language(language: str) -> str:
    raw_language = (language or "").strip().lower()
    normalized_language = LANGUAGE_ALIASES.get(raw_language, raw_language)
    if normalized_language not in LANGUAGE_FILE_EXTENSIONS:
        normalized_language = ""
    if normalized_language == "dockerfile":
        return "Dockerfile"
    if normalized_language == "makefile":
        return "Makefile"
    ext = LANGUAGE_FILE_EXTENSIONS.get(normalized_language, "txt")
    if ext == "txt":
        return "main.txt"
    return f"main.{ext}"


def decode_base64_payload(raw_payload: str):
    if not isinstance(raw_payload, str):
        return None
    payload = raw_payload.strip()
    if not payload:
        return None
    if payload.startswith("data:"):
        comma_index = payload.find(",")
        if comma_index != -1:
            payload = payload[comma_index + 1:]
    try:
        return base64.b64decode(payload)
    except Exception:
        return None


def normalize_highlighted_lines(raw_lines):
    """Normalize selected code line numbers for storage and replay."""
    if raw_lines is None:
        return []
    if isinstance(raw_lines, str):
        raw_items = re.split(r"[\s,]+", raw_lines.strip())
    elif isinstance(raw_lines, (list, tuple, set)):
        raw_items = raw_lines
    else:
        return []

    normalized = set()
    for raw_item in raw_items:
        try:
            line_number = int(raw_item)
        except (TypeError, ValueError):
            continue
        if line_number > 0:
            normalized.add(line_number)
    return sorted(normalized)


def parse_project_sections(body_lines, project_id=None):
    """
    解析 sharecode 文本中的多文件标记。
    若不存在标记，则 has_markers=False，raw_content 为原文本。
    """
    has_markers = any(
        line.startswith(FILENAME_MARKER)
        or line.startswith(ASSET_MARKER)
        or line.startswith(FOLDER_MARKER)
        for line in body_lines
    )
    raw_content = "".join(body_lines)
    if not has_markers:
        return {
            "has_markers": False,
            "raw_content": raw_content,
            "text_files": [],
            "assets": [],
            "folders": [],
        }

    text_files = []
    assets = []
    folders = []
    current_path = None
    current_language = "python"
    current_highlighted_lines = []
    current_content_lines = []

    def flush_current_file():
        nonlocal current_path, current_language, current_highlighted_lines, current_content_lines
        if not current_path:
            current_highlighted_lines = []
            current_content_lines = []
            return
        text_files.append({
            "path": current_path,
            "content": "".join(current_content_lines),
            "language": current_language,
            "highlighted_lines": normalize_highlighted_lines(current_highlighted_lines),
        })
        current_path = None
        current_language = "python"
        current_highlighted_lines = []
        current_content_lines = []

    for line in body_lines:
        if line.startswith(FILENAME_MARKER):
            flush_current_file()
            raw_path = line.split("=", 1)[1].strip()
            safe_path = normalize_project_relative_path(raw_path)
            if not safe_path:
                safe_path = default_filename_for_language("python")
            current_path = safe_path
            current_language = detect_language_from_filename(safe_path)
            current_highlighted_lines = []
            continue

        if line.startswith(FILE_LANGUAGE_MARKER):
            if current_path is not None:
                raw_language = line.split("=", 1)[1].strip()
                current_language = normalize_language(raw_language, current_language)
            continue

        if line.startswith(LINE_HIGHLIGHTS_MARKER):
            if current_path is not None:
                raw_highlighted_lines = line.split("=", 1)[1].strip()
                current_highlighted_lines = normalize_highlighted_lines(raw_highlighted_lines)
            continue

        if line.startswith(FOLDER_MARKER):
            flush_current_file()
            raw_path = line.split("=", 1)[1].strip()
            safe_path = normalize_project_relative_path(raw_path)
            if safe_path and safe_path not in folders:
                folders.append(safe_path)
            continue

        if line.startswith(ASSET_MARKER):
            flush_current_file()
            raw_payload = line.split("=", 1)[1].strip()
            payload_parts = raw_payload.split("|")
            logical_path = normalize_project_relative_path(payload_parts[0] if len(payload_parts) > 0 else "")
            stored_path = normalize_project_relative_path(payload_parts[1] if len(payload_parts) > 1 else logical_path)
            mime_type = (payload_parts[2].strip() if len(payload_parts) > 2 else "") or "application/octet-stream"
            size_raw = payload_parts[3].strip() if len(payload_parts) > 3 else ""
            size = int(size_raw) if size_raw.isdigit() else 0
            if logical_path and stored_path:
                asset_data = {
                    "path": logical_path,
                    "stored_path": stored_path,
                    "mime_type": mime_type,
                    "size": size,
                }
                if project_id:
                    asset_data["source_project_id"] = project_id
                    asset_data["source_stored_path"] = stored_path
                    asset_data["url"] = url_for(
                        "get_shared_asset",
                        project_id=project_id,
                        asset_path=stored_path,
                        _external=True
                    )
                assets.append(asset_data)
            continue

        if current_path is not None:
            current_content_lines.append(line)

    flush_current_file()

    return {
        "has_markers": True,
        "raw_content": raw_content,
        "text_files": text_files,
        "assets": assets,
        "folders": folders,
    }


def persist_project_payload(code_file_path, template_type, language, theme, code, project_payload, project_id):
    """将单文件或多文件项目写入 sharecode 文本，并持久化资源文件。"""
    project_data = project_payload if isinstance(project_payload, dict) else {}
    language = normalize_language(language)
    theme = normalize_theme(theme or project_data.get("theme", ""))

    text_files = []
    folders = []
    incoming_folders = project_data.get("folders", project_data.get("project_folders", []))
    if isinstance(incoming_folders, list):
        for folder_item in incoming_folders:
            safe_path = normalize_project_relative_path(
                folder_item if isinstance(folder_item, str) else (
                    folder_item.get("path") if isinstance(folder_item, dict) else ""
                )
            )
            if safe_path and safe_path not in folders:
                folders.append(safe_path)

    incoming_text_files = project_data.get("text_files", [])
    if isinstance(incoming_text_files, list):
        for idx, file_item in enumerate(incoming_text_files):
            if not isinstance(file_item, dict):
                continue
            safe_path = normalize_project_relative_path(
                file_item.get("path") or file_item.get("name") or f"file_{idx + 1}.txt"
            )
            if not safe_path:
                continue
            raw_content = file_item.get("content", "")
            content = raw_content if isinstance(raw_content, str) else str(raw_content)
            highlighted_lines = normalize_highlighted_lines(
                file_item.get("highlighted_lines", file_item.get("line_highlights", []))
            )
            detected_language = detect_language_from_filename(safe_path)
            file_language = normalize_language(file_item.get("language", ""), detected_language)
            text_files.append({
                "path": safe_path,
                "content": content,
                "language": file_language,
                "highlighted_lines": highlighted_lines,
            })

    # 仅当有真实代码内容时，才补一个兜底文件；否则保留“无内容分享”的状态
    if code and not text_files and not folders:
        fallback_path = default_filename_for_language(language)
        text_files.append({
            "path": fallback_path,
            "content": code,
            "language": normalize_language(language, detect_language_from_filename(fallback_path)),
            "highlighted_lines": [],
        })

    asset_folder = os.path.join("sharecode", "assets", project_id)
    os.makedirs(asset_folder, exist_ok=True)

    assets_meta = []
    incoming_assets = project_data.get("assets", [])
    if isinstance(incoming_assets, list):
        for idx, asset_item in enumerate(incoming_assets):
            if not isinstance(asset_item, dict):
                continue

            safe_logical_path = normalize_asset_logical_path(
                asset_item.get("path") or asset_item.get("name") or f"asset_{idx + 1}"
            )
            if not safe_logical_path:
                continue

            stored_path = safe_logical_path
            abs_stored_path = os.path.join(asset_folder, stored_path)
            os.makedirs(os.path.dirname(abs_stored_path), exist_ok=True)

            written = False

            data_base64 = asset_item.get("data_base64")
            if isinstance(data_base64, str) and data_base64.strip():
                decoded_bytes = decode_base64_payload(data_base64)
                if decoded_bytes is not None:
                    with open(abs_stored_path, "wb") as af:
                        af.write(decoded_bytes)
                    written = True

            if not written:
                source_project_id = asset_item.get("source_project_id")
                source_stored_path = normalize_project_relative_path(asset_item.get("source_stored_path", ""))
                if source_project_id and source_stored_path:
                    source_abs_path = os.path.join("sharecode", "assets", source_project_id, source_stored_path)
                    if os.path.isfile(source_abs_path):
                        shutil.copy2(source_abs_path, abs_stored_path)
                        written = True

            if not written and os.path.isfile(abs_stored_path):
                written = True

            if not written:
                continue

            mime_type = asset_item.get("mime_type")
            if not isinstance(mime_type, str) or not mime_type.strip():
                mime_type = "application/octet-stream"
            file_size = os.path.getsize(abs_stored_path) if os.path.isfile(abs_stored_path) else 0

            assets_meta.append({
                "path": safe_logical_path,
                "stored_path": stored_path,
                "mime_type": mime_type,
                "size": file_size,
            })

    with open(code_file_path, 'w', encoding='utf-8') as f:
        f.write(f"__TEMPLATE__={template_type}\n")
        f.write(f"__LANG__={language}\n")
        f.write(f"{THEME_MARKER}{theme}\n")
        for folder_path in folders:
            f.write(f"{FOLDER_MARKER}{folder_path}\n")
        for text_file in text_files:
            f.write(f"{FILENAME_MARKER}{text_file['path']}\n")
            f.write(f"{FILE_LANGUAGE_MARKER}{normalize_language(text_file.get('language', ''))}\n")
            highlighted_lines = normalize_highlighted_lines(text_file.get("highlighted_lines", []))
            if highlighted_lines:
                f.write(f"{LINE_HIGHLIGHTS_MARKER}{','.join(str(line) for line in highlighted_lines)}\n")
            f.write(text_file["content"])
            if not text_file["content"].endswith("\n"):
                f.write("\n")
        for asset_item in assets_meta:
            f.write(
                f"{ASSET_MARKER}{asset_item['path']}|{asset_item['stored_path']}|"
                f"{asset_item['mime_type']}|{asset_item['size']}\n"
            )

    return text_files, assets_meta


def get_project_payload_for_download(raw_payload: str):
    if not raw_payload:
        return {}
    try:
        payload = json.loads(raw_payload)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def sanitize_download_filename(raw_filename: str) -> str:
    filename = raw_filename if isinstance(raw_filename, str) else ""
    filename = os.path.basename(filename.strip())
    filename = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-")
    if not filename:
        filename = "codemark-project.zip"
    if not filename.lower().endswith(".zip"):
        filename += ".zip"
    return filename


def write_zip_folder(zip_file, folder_path, written_names):
    safe_path = normalize_project_relative_path(folder_path)
    if not safe_path:
        return
    zip_path = safe_path.rstrip("/") + "/"
    if zip_path not in written_names:
        zip_file.writestr(zip_path, "")
        written_names.add(zip_path)


def write_zip_bytes(zip_file, file_path, data, written_names):
    safe_path = normalize_project_relative_path(file_path)
    if not safe_path or safe_path.endswith("/"):
        return False
    if safe_path in written_names:
        return False
    parent_path = os.path.dirname(safe_path).replace("\\", "/")
    if parent_path:
        write_zip_folder(zip_file, parent_path, written_names)
    zip_file.writestr(safe_path, data)
    written_names.add(safe_path)
    return True

def parse_sort_key(filename):
    """
    如果文件名以数字开头，则按数字排序，否则返回一个随机数以保证随机排序。
    示例：
        01-hello.md -> sort_key = 1
        10-world.md -> sort_key = 10
        readme.md   -> sort_key = 随机
    """
    match = re.match(r'^(\d+)', filename)
    if match:
        return int(match.group(1))
    else:
        # 如果你想每次都相同随机顺序，可自行改为其他逻辑
        return random.randint(100000, 999999)


def get_title_from_filename(filename):
    """
    去掉文件的扩展名和开头的数字序号后，作为文章展示标题。
    比如 '01-hello.md' -> 'hello'; 'readme.md' -> 'readme'
    你也可以在这里做更精细的标题提取，比如读取 markdown 第一行的 # 标题等。
    """
    # 去掉 .md
    name = filename.rsplit('.md', 1)[0]
    # 去掉开头的数字和中划线等
    name = re.sub(r'^(\d+)(-|\s)*', '', name)
    return name


def build_directory_tree(root_dir):
    """
    递归地构建目录树数据结构：
    返回示例:
    {
      'dirname': 'articles',
      'subdirs': {
          'Python': {
              'dirname': 'Python',
              'subdirs': {...},
              'files': [{'filename': '01-intro.md','title': 'intro'}, ...]
          },
          ...
      },
      'files': [{'filename': 'readme.md','title': 'readme'}, ...]
    }
    """
    tree = {
        'dirname': os.path.basename(root_dir),
        'subdirs': {},
        'files': []
    }

    # 获取当前目录下的所有条目
    entries = os.listdir(root_dir)
    # 先把目录和文件分开
    dirs = [d for d in entries if os.path.isdir(os.path.join(root_dir, d))]
    files = [f for f in entries if os.path.isfile(os.path.join(root_dir, f)) and f.endswith('.md')]

    # 排序文件
    files_sorted = sorted(files, key=parse_sort_key)
    for f in files_sorted:
        tree['files'].append({
            'filename': f,
            'title': get_title_from_filename(f)
        })

    # 递归处理子目录
    for d in dirs:
        subdir_path = os.path.join(root_dir, d)
        # 这里直接递归构建子目录结构
        tree['subdirs'][d] = build_directory_tree(subdir_path)

    return tree


@app.route('/')
def index():
    """
    新版主页：遍历 'articles' 目录，将其按目录分组后，在首页以类别的形式展示
    """
    # 构建整个 articles 文件夹的目录树
    directory_tree = build_directory_tree('articles')
    # 传给模板做展示
    return render_template('index.html', directory_tree=directory_tree)


@app.route('/article/<path:filename>')
def article(filename):
    """
    文章阅读页面。
    1. 根据 filename 打开指定 .md 文件，渲染为 HTML。
    2. 同时也把目录树传给 article.html，用以在左侧显示 VuePress 风格 sidebar。
    3. 将 current_file=filename 传递给模板，用于高亮当前文章并展开所在目录。
    """
    full_path = os.path.join('articles', filename)
    if not os.path.isfile(full_path):
        return f"File not found: {filename}", 404

    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
        md = markdown.Markdown(extensions=[
            'extra',  # 包含tables、fenced_code、footnotes、def_list等常用扩展
            'admonition',  # 支持 !!! note / warning 等提示块
            'attr_list',  # 允许添加HTML属性
            'codehilite',  # 代码高亮
            'def_list',
            'fenced_code',
            'footnotes',
            'tables',
            'abbr',
            'meta',
            'nl2br',
            'sane_lists',
            'smarty',
            'toc',
        ])
        html_content = md.convert(content)
        toc = md.toc
        # 获取元信息（meta），每个字段都是列表，如 meta['title'] = ['xxx']
        meta = md.Meta if hasattr(md, 'Meta') else {}

    # 构建整个 articles 文件夹的目录树（用于左侧侧边栏）
    directory_tree = build_directory_tree('articles')

    return render_template('article.html',
                           content=html_content,
                           toc=toc,
                           directory_tree=directory_tree,
                           current_file=filename,
                           meta=meta)


def is_mobile(user_agent: str) -> bool:
    """
    判断是否为移动端访问，根据 user-agent 中常见的移动端标识来做简单匹配。
    你可以根据业务需要，添加或修改更多关键词。
    """
    mobile_regex = re.compile(r'Mobile|Android|iPhone|iPad|iPod', re.IGNORECASE)
    return bool(mobile_regex.search(user_agent))


def is_mobile_request() -> bool:
    """根据当前请求头判断是否移动端。"""
    user_agent = request.headers.get('User-Agent', '')
    return is_mobile(user_agent)


@app.route('/editor')
def editor():
    """
    直接访问 /editor 时，如果没带任何参数，就给它一个空字符串，用于编辑器初始化。
    使用可执行 Python 的模板 editor.html。
    """
    return render_template(
        'editor.html',
        pre_code="",
        pre_lang="python",
        pre_theme=DEFAULT_CODE_THEME,
        pre_project=None,
        share_project_id="",
        is_mobile=is_mobile_request()
    )


@app.route('/sharecode')
def sharecode():
    """
    直接访问 /sharecode 时，如果没带任何参数，就给它一个空字符串，用于编辑器初始化。
    使用不执行 Python 的模板 sharecode.html。
    """
    return render_template(
        'sharecode.html',
        pre_code="",
        pre_lang="python",
        pre_theme=DEFAULT_CODE_THEME,
        pre_project=None,
        share_project_id="",
        is_mobile=is_mobile_request()
    )


@app.route('/upload_code', methods=['POST'])
def upload_code():
    """
    前端 share() 函数会通过 AJAX 调用这个接口，提交代码内容。
    这里将代码保存到本地文件，生成二维码图片，并返回一个可分享的链接。

    同时根据 template 值（editor / sharecode）记录在文本文件前几行，
    以便后续 /share/<project_id> 时做判断，使用对应模板渲染，并记住语言 language。
    """
    # 从前端获取代码
    code = request.form.get('code', '')
    # 也可以取一下语言信息
    language = normalize_language(request.form.get('language', '') or "python")
    # 新增获取模板类型（默认用 editor）
    template_type = request.form.get('template', 'editor')
    project_payload_raw = request.form.get('project_payload', '')
    project_payload = None
    if project_payload_raw:
        try:
            project_payload = json.loads(project_payload_raw)
        except Exception:
            project_payload = None
    payload_theme = project_payload.get("theme", "") if isinstance(project_payload, dict) else ""
    theme = normalize_theme(request.form.get('theme', '') or payload_theme)

    # 生成一个唯一 ID
    unique_id = str(uuid.uuid4())
    # 时间戳
    timestamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
    # 拼接最终 project_id
    project_id = unique_id + "_" + timestamp

    # 1. 先拼装 sharecode/<yearmonth>/ 路径
    yearmonth = datetime.datetime.now().strftime('%Y%m')
    month_folder = os.path.join('sharecode', yearmonth)
    os.makedirs(month_folder, exist_ok=True)

    code_file_path = os.path.join(month_folder, project_id + ".txt")
    if isinstance(project_payload, dict):
        persist_project_payload(
            code_file_path=code_file_path,
            template_type=template_type,
            language=language,
            theme=theme,
            code=code,
            project_payload=project_payload,
            project_id=project_id,
        )
    else:
        # 兼容原单文件存储格式
        with open(code_file_path, 'w', encoding='utf-8') as f:
            f.write(f"__TEMPLATE__={template_type}\n")
            f.write(f"__LANG__={language}\n")
            f.write(f"{THEME_MARKER}{theme}\n")
            f.write(code)

    # 3. 生成二维码并保存在 sharecode/images 文件夹
    images_folder = os.path.join('sharecode', 'images')
    os.makedirs(images_folder, exist_ok=True)

    # 构造可分享链接，比如 http://127.0.0.1:5000/share/<project_id>
    # 如果你有域名，可用: https://yourdomain.com/share/<project_id>
    # share_link = request.host_url.strip('/') + "/share/" + project_id
    share_link = url_for('show_shared_code', project_id=project_id, _external=True)  # 可以强制 https: _scheme='https'
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(share_link)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    img_file_path = os.path.join(images_folder, project_id + ".png")
    img.save(img_file_path)

    # 返回给前端
    return jsonify({
        "project_id": project_id,
        "share_link": share_link,
    })


@app.route('/download_project_zip', methods=['POST'])
def download_project_zip():
    project_payload = get_project_payload_for_download(request.form.get('project_payload', ''))
    filename = sanitize_download_filename(request.form.get('filename', 'codemark-project.zip'))

    archive_buffer = io.BytesIO()
    written_names = set()

    with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        incoming_folders = project_payload.get("folders", project_payload.get("project_folders", []))
        if isinstance(incoming_folders, list):
            for folder_item in incoming_folders:
                folder_path = folder_item if isinstance(folder_item, str) else (
                    folder_item.get("path") if isinstance(folder_item, dict) else ""
                )
                write_zip_folder(zip_file, folder_path, written_names)

        incoming_text_files = project_payload.get("text_files", [])
        text_file_count = 0
        if isinstance(incoming_text_files, list):
            for idx, file_item in enumerate(incoming_text_files):
                if not isinstance(file_item, dict):
                    continue
                safe_path = normalize_project_relative_path(
                    file_item.get("path") or file_item.get("name") or f"file_{idx + 1}.txt"
                )
                if not safe_path:
                    continue
                raw_content = file_item.get("content", "")
                content = raw_content if isinstance(raw_content, str) else str(raw_content)
                if write_zip_bytes(zip_file, safe_path, content.encode("utf-8"), written_names):
                    text_file_count += 1

        if text_file_count == 0:
            fallback_code = request.form.get("code", "")
            if fallback_code:
                fallback_language = normalize_language(request.form.get("language", "") or "python")
                write_zip_bytes(
                    zip_file,
                    default_filename_for_language(fallback_language),
                    fallback_code.encode("utf-8"),
                    written_names
                )

        incoming_assets = project_payload.get("assets", [])
        if isinstance(incoming_assets, list):
            for idx, asset_item in enumerate(incoming_assets):
                if not isinstance(asset_item, dict):
                    continue
                safe_path = normalize_project_relative_path(
                    asset_item.get("path") or asset_item.get("name") or f"asset_{idx + 1}"
                )
                if not safe_path:
                    continue

                asset_bytes = None
                data_base64 = asset_item.get("data_base64")
                if isinstance(data_base64, str) and data_base64.strip():
                    asset_bytes = decode_base64_payload(data_base64)

                if asset_bytes is None:
                    source_project_id = asset_item.get("source_project_id")
                    source_stored_path = normalize_project_relative_path(asset_item.get("source_stored_path", ""))
                    if (
                        isinstance(source_project_id, str)
                        and re.fullmatch(r"[A-Za-z0-9._-]+", source_project_id)
                        and source_stored_path
                    ):
                        source_abs_path = os.path.join("sharecode", "assets", source_project_id, source_stored_path)
                        if os.path.isfile(source_abs_path):
                            with open(source_abs_path, "rb") as source_file:
                                asset_bytes = source_file.read()

                if asset_bytes is not None:
                    write_zip_bytes(zip_file, safe_path, asset_bytes, written_names)

        if not written_names:
            zip_file.writestr("README.txt", "CodeMark project is empty.\n")

    archive_buffer.seek(0)
    return send_file(
        archive_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=filename
    )


@app.route('/share_asset/<project_id>/<path:asset_path>')
def get_shared_asset(project_id, asset_path):
    safe_asset_path = normalize_project_relative_path(asset_path)
    if not safe_asset_path:
        return "File not found", 404
    asset_root = os.path.join("sharecode", "assets", project_id)
    abs_asset_path = os.path.join(asset_root, safe_asset_path)
    if not os.path.isfile(abs_asset_path):
        return "File not found", 404
    return send_from_directory(asset_root, safe_asset_path)


@app.route('/share/<project_id>')
def show_shared_code(project_id):
    """
    当别人访问 /share/<project_id> 时，
    从本地 txt 文件读取对应代码的同时，也读取第一、二行以判断使用哪种模板和语言。
    """
    code_content = "File not found or removed."
    template_type = "editor"  # 默认使用 editor
    lang = "python"  # 默认 python
    theme = DEFAULT_CODE_THEME
    pre_project = None
    sharecode_root = "sharecode"
    found = False

    # 遍历 sharecode 文件夹下的所有子目录，找 <project_id>.txt
    for folder in os.listdir(sharecode_root):
        folder_path = os.path.join(sharecode_root, folder)
        if os.path.isdir(folder_path):
            possible_path = os.path.join(folder_path, project_id + ".txt")
            if os.path.isfile(possible_path):
                found = True
                with open(possible_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()

                body_start_index = 0
                while body_start_index < len(lines):
                    line = lines[body_start_index]
                    if line.startswith("__TEMPLATE__="):
                        template_type = line.split("=", 1)[1].strip()
                    elif line.startswith("__LANG__="):
                        lang = normalize_language(line.split("=", 1)[1].strip())
                    elif line.startswith(THEME_MARKER):
                        theme = normalize_theme(line.split("=", 1)[1].strip())
                    else:
                        break
                    body_start_index += 1

                body_lines = lines[body_start_index:]
                parsed_project = parse_project_sections(body_lines, project_id=project_id)
                if parsed_project["has_markers"]:
                    text_files = parsed_project["text_files"]
                    assets = parsed_project["assets"]
                    folders = parsed_project.get("folders", [])
                    if text_files:
                        code_content = text_files[0]["content"]
                        lang = normalize_language(text_files[0].get("language", lang) or lang, lang)
                    else:
                        code_content = ""
                    pre_project = {
                        "text_files": text_files,
                        "assets": assets,
                        "folders": folders,
                        "active_file": text_files[0]["path"] if text_files else "",
                    }
                else:
                    code_content = parsed_project["raw_content"]
                    # 仅当存在实际代码内容时才构造兜底单文件项目；空内容时让前端直接呈现“空项目”
                    if template_type == "sharecode" and code_content:
                        fallback_path = default_filename_for_language(lang)
                        pre_project = {
                            "text_files": [{
                                "path": fallback_path,
                                "content": code_content,
                                "language": normalize_language(lang, detect_language_from_filename(fallback_path)),
                                "highlighted_lines": [],
                            }],
                            "assets": [],
                            "folders": [],
                            "active_file": fallback_path,
                        }
                break

    if not found:
        return f"File not found: {project_id}", 404

    # 根据 template_type 来渲染不同的模板，并将 lang 也传过去
    target_template = 'sharecode.html' if template_type == "sharecode" else 'editor.html'
    if target_template == "sharecode.html":
        return render_template(
            target_template,
            pre_code=code_content,
            pre_lang=lang,
            pre_theme=theme,
            pre_project=pre_project,
            share_project_id=project_id,
            is_mobile=is_mobile_request()
        )

    return render_template(
        target_template,
        pre_code=code_content,
        pre_lang=lang,
        pre_theme=theme,
        pre_project=pre_project,
        share_project_id=project_id,
        is_mobile=is_mobile_request()
    )


if __name__ == '__main__':
    # app.run(debug=True)
    app.run(host="0.0.0.0", port=8991)
