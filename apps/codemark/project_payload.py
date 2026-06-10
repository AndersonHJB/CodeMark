import base64
import json
import os
import re
import shutil

from .runtime import build_url


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
                    asset_data["url"] = build_url(
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
