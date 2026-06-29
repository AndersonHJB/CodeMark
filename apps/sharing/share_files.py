import datetime
import os
import re
import shutil

from django.conf import settings
from django.utils import timezone

from apps.common.project_payload import (
    DEFAULT_CODE_THEME,
    THEME_MARKER,
    default_filename_for_language,
    detect_language_from_filename,
    normalize_language,
    normalize_theme,
    parse_project_sections,
)


SHARE_PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
SHARE_TIMESTAMP_PATTERN = re.compile(r"_([0-9]{14})$")
SHARE_SYSTEM_DIRS = {"assets", "images"}
OWNER_ID_MARKER = "__OWNER_ID__="
IMAGE_EXTENSIONS = {"avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"}
VIDEO_EXTENSIONS = {"avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"}
AUDIO_EXTENSIONS = {"aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"}


def iter_share_file_paths():
    sharecode_root = settings.CODEMARK_SHARECODE_DIR
    if not os.path.isdir(sharecode_root):
        return

    for folder_name in sorted(os.listdir(sharecode_root), reverse=True):
        if folder_name in SHARE_SYSTEM_DIRS:
            continue
        folder_path = os.path.join(sharecode_root, folder_name)
        if not os.path.isdir(folder_path):
            continue
        for file_name in sorted(os.listdir(folder_path), reverse=True):
            if file_name.endswith(".txt"):
                yield os.path.join(folder_path, file_name)


def find_share_file_path(project_id):
    if not isinstance(project_id, str) or not SHARE_PROJECT_ID_PATTERN.fullmatch(project_id):
        return None

    for file_path in iter_share_file_paths() or []:
        if os.path.basename(file_path) == f"{project_id}.txt":
            return file_path
    return None


def parse_share_timestamp(project_id, fallback_timestamp):
    timestamp_match = SHARE_TIMESTAMP_PATTERN.search(project_id)
    if timestamp_match:
        try:
            naive_dt = datetime.datetime.strptime(timestamp_match.group(1), "%Y%m%d%H%M%S")
            return timezone.make_aware(naive_dt, timezone.get_current_timezone())
        except ValueError:
            pass
    return datetime.datetime.fromtimestamp(fallback_timestamp, tz=timezone.get_current_timezone())


def classify_asset_preview_type(asset):
    mime_type = (asset.get("mime_type") or "").strip().lower()
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"

    asset_path = asset.get("path") or asset.get("stored_path") or ""
    extension = os.path.splitext(asset_path.lower())[1].lstrip(".")
    if extension in IMAGE_EXTENSIONS:
        return "image"
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    return "file"


def enrich_asset_previews(assets):
    for asset in assets:
        asset["preview_type"] = classify_asset_preview_type(asset)
    return assets


def parse_share_file(file_path, include_content=False):
    project_id = os.path.splitext(os.path.basename(file_path))[0]
    file_stat = os.stat(file_path)

    template_type = "editor"
    language = "python"
    theme = DEFAULT_CODE_THEME
    owner_user_id = None

    with open(file_path, "r", encoding="utf-8") as share_file:
        lines = share_file.readlines()
    stored_content = "".join(lines)

    body_start_index = 0
    while body_start_index < len(lines):
        line = lines[body_start_index]
        if line.startswith("__TEMPLATE__="):
            template_type = line.split("=", 1)[1].strip() or template_type
        elif line.startswith("__LANG__="):
            language = normalize_language(line.split("=", 1)[1].strip(), language)
        elif line.startswith(THEME_MARKER):
            theme = normalize_theme(line.split("=", 1)[1].strip(), theme)
        elif line.startswith(OWNER_ID_MARKER):
            raw_owner_user_id = line.split("=", 1)[1].strip()
            owner_user_id = int(raw_owner_user_id) if raw_owner_user_id.isdigit() else None
        else:
            break
        body_start_index += 1

    body_lines = lines[body_start_index:]
    parsed_project = parse_project_sections(body_lines, project_id=project_id)
    raw_content = parsed_project.get("raw_content", "")
    text_files = parsed_project.get("text_files", [])
    folders = parsed_project.get("folders", [])
    assets = enrich_asset_previews(parsed_project.get("assets", []))

    if not parsed_project.get("has_markers"):
        if raw_content:
            fallback_path = default_filename_for_language(language)
            text_files = [{
                "path": fallback_path,
                "content": raw_content,
                "language": normalize_language(language, detect_language_from_filename(fallback_path)),
                "highlighted_lines": [],
            }]
        else:
            text_files = []

    content_chars = sum(len(item.get("content", "")) for item in text_files)
    preview_text = ""
    if text_files:
        preview_text = text_files[0].get("content", "").strip().replace("\r", "")
    elif raw_content:
        preview_text = raw_content.strip().replace("\r", "")
    preview_text = preview_text[:240]

    qr_path = os.path.join(settings.CODEMARK_SHARECODE_DIR, "images", f"{project_id}.png")

    record = {
        "project_id": project_id,
        "template_type": template_type,
        "language": language,
        "theme": theme,
        "owner_user_id": owner_user_id,
        "storage_path": file_path,
        "storage_month": os.path.basename(os.path.dirname(file_path)),
        "size": file_stat.st_size,
        "modified_at": datetime.datetime.fromtimestamp(file_stat.st_mtime, tz=timezone.get_current_timezone()),
        "created_at": parse_share_timestamp(project_id, file_stat.st_mtime),
        "text_file_count": len(text_files),
        "folder_count": len(folders),
        "asset_count": len(assets),
        "content_chars": content_chars,
        "preview_text": preview_text,
        "share_path": f"/share/{project_id}",
        "qr_path": qr_path if os.path.isfile(qr_path) else "",
    }

    if include_content:
        record.update({
            "stored_content": stored_content,
            "raw_content": raw_content,
            "text_files": text_files,
            "folders": folders,
            "assets": assets,
            "headers": {
                "template_type": template_type,
                "language": language,
                "theme": theme,
                "owner_user_id": owner_user_id,
            },
        })

    return record


def list_shared_code_records(query="", owner_user_id=None):
    normalized_query = (query or "").strip().lower()
    normalized_owner_user_id = None
    if owner_user_id is not None:
        try:
            normalized_owner_user_id = int(owner_user_id)
        except (TypeError, ValueError):
            normalized_owner_user_id = -1
    records = []

    for file_path in iter_share_file_paths() or []:
        record = parse_share_file(file_path, include_content=bool(normalized_query))
        if normalized_owner_user_id is not None and record.get("owner_user_id") != normalized_owner_user_id:
            continue
        if normalized_query:
            searchable_parts = [
                record["project_id"],
                record["template_type"],
                record["language"],
                record.get("raw_content", ""),
            ]
            searchable_parts.extend(item.get("path", "") for item in record.get("text_files", []))
            searchable_parts.extend(item.get("content", "") for item in record.get("text_files", []))
            if normalized_query not in "\n".join(searchable_parts).lower():
                continue
        records.append(record)

    return sorted(records, key=lambda item: item["created_at"], reverse=True)


def get_shared_code_record(project_id):
    file_path = find_share_file_path(project_id)
    if not file_path:
        return None
    return parse_share_file(file_path, include_content=True)


def delete_shared_code_record(project_id, owner_user_id=None):
    record = get_shared_code_record(project_id)
    if not record:
        return False

    if owner_user_id is not None:
        try:
            normalized_owner_user_id = int(owner_user_id)
        except (TypeError, ValueError):
            return False
        if record.get("owner_user_id") != normalized_owner_user_id:
            return False

    storage_path = record.get("storage_path")
    if storage_path and os.path.isfile(storage_path):
        os.remove(storage_path)

    month_folder = os.path.dirname(storage_path) if storage_path else ""
    if month_folder and os.path.isdir(month_folder):
        try:
            os.rmdir(month_folder)
        except OSError:
            pass

    qr_path = os.path.join(settings.CODEMARK_SHARECODE_DIR, "images", f"{record['project_id']}.png")
    if os.path.isfile(qr_path):
        os.remove(qr_path)

    asset_root = os.path.join(settings.CODEMARK_SHARECODE_DIR, "assets", record["project_id"])
    if os.path.isdir(asset_root):
        shutil.rmtree(asset_root)

    return True
