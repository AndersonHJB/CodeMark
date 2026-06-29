import datetime
import math
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
USER_DELETED_AT_MARKER = "__USER_DELETED_AT__="
USER_DELETED_BY_MARKER = "__USER_DELETED_BY__="
ADMIN_DELETED_AT_MARKER = "__ADMIN_DELETED_AT__="
ADMIN_DELETED_BY_MARKER = "__ADMIN_DELETED_BY__="
SHARE_TEMPLATE_MARKER = "__TEMPLATE__="
SHARE_LANGUAGE_MARKER = "__LANG__="
SHARE_TRASH_RETENTION_DAYS = 30
ADMIN_SHARE_ACCESS_PARAM = "admin_view"
SHARE_HEADER_MARKERS = (
    SHARE_TEMPLATE_MARKER,
    SHARE_LANGUAGE_MARKER,
    THEME_MARKER,
    OWNER_ID_MARKER,
    USER_DELETED_AT_MARKER,
    USER_DELETED_BY_MARKER,
    ADMIN_DELETED_AT_MARKER,
    ADMIN_DELETED_BY_MARKER,
)
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


def format_share_metadata_datetime(value):
    return timezone.localtime(value).isoformat(timespec="seconds")


def parse_share_metadata_datetime(raw_value):
    raw_value = (raw_value or "").strip()
    if not raw_value:
        return None
    try:
        parsed_value = datetime.datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if timezone.is_naive(parsed_value):
        return timezone.make_aware(parsed_value, timezone.get_current_timezone())
    return parsed_value


def split_share_file_lines(lines):
    body_start_index = 0
    while body_start_index < len(lines):
        if any(lines[body_start_index].startswith(marker) for marker in SHARE_HEADER_MARKERS):
            body_start_index += 1
            continue
        break
    return lines[:body_start_index], lines[body_start_index:]


def parse_integer_metadata(raw_value):
    raw_value = (raw_value or "").strip()
    return int(raw_value) if raw_value.isdigit() else None


def parse_share_header_lines(header_lines):
    headers = {
        "template_type": "editor",
        "language": "python",
        "theme": DEFAULT_CODE_THEME,
        "owner_user_id": None,
        "user_deleted_at": None,
        "user_deleted_by": None,
        "admin_deleted_at": None,
        "admin_deleted_by": None,
    }
    for line in header_lines:
        if line.startswith(SHARE_TEMPLATE_MARKER):
            headers["template_type"] = line.split("=", 1)[1].strip() or headers["template_type"]
        elif line.startswith(SHARE_LANGUAGE_MARKER):
            headers["language"] = normalize_language(line.split("=", 1)[1].strip(), headers["language"])
        elif line.startswith(THEME_MARKER):
            headers["theme"] = normalize_theme(line.split("=", 1)[1].strip(), headers["theme"])
        elif line.startswith(OWNER_ID_MARKER):
            headers["owner_user_id"] = parse_integer_metadata(line.split("=", 1)[1])
        elif line.startswith(USER_DELETED_AT_MARKER):
            headers["user_deleted_at"] = parse_share_metadata_datetime(line.split("=", 1)[1])
        elif line.startswith(USER_DELETED_BY_MARKER):
            headers["user_deleted_by"] = parse_integer_metadata(line.split("=", 1)[1])
        elif line.startswith(ADMIN_DELETED_AT_MARKER):
            headers["admin_deleted_at"] = parse_share_metadata_datetime(line.split("=", 1)[1])
        elif line.startswith(ADMIN_DELETED_BY_MARKER):
            headers["admin_deleted_by"] = parse_integer_metadata(line.split("=", 1)[1])
    return headers


def append_query_param(url, name, value):
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{name}={value}"


def enrich_share_deletion_state(record):
    now = timezone.now()
    user_deleted_at = record.get("user_deleted_at")
    admin_deleted_at = record.get("admin_deleted_at")
    user_delete_expires_at = None
    user_delete_is_expired = False
    trash_days_remaining = None

    if user_deleted_at:
        user_delete_expires_at = user_deleted_at + datetime.timedelta(days=SHARE_TRASH_RETENTION_DAYS)
        user_delete_is_expired = now > user_delete_expires_at
        remaining_seconds = max(0, (user_delete_expires_at - now).total_seconds())
        trash_days_remaining = int(math.ceil(remaining_seconds / 86400)) if remaining_seconds else 0

    record.update({
        "is_user_deleted": bool(user_deleted_at),
        "is_admin_deleted": bool(admin_deleted_at),
        "is_deleted": bool(user_deleted_at or admin_deleted_at),
        "public_accessible": not user_deleted_at and not admin_deleted_at,
        "user_delete_expires_at": user_delete_expires_at,
        "user_delete_is_expired": user_delete_is_expired,
        "user_trash_is_recoverable": bool(user_deleted_at and not admin_deleted_at and not user_delete_is_expired),
        "trash_days_remaining": trash_days_remaining,
        "delete_status": "管理员删除" if admin_deleted_at else ("用户删除" if user_deleted_at else "正常"),
    })
    return record


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
        if asset.get("url"):
            asset["admin_url"] = append_query_param(asset["url"], ADMIN_SHARE_ACCESS_PARAM, "1")
    return assets


def parse_share_file(file_path, include_content=False):
    project_id = os.path.splitext(os.path.basename(file_path))[0]
    file_stat = os.stat(file_path)

    with open(file_path, "r", encoding="utf-8") as share_file:
        lines = share_file.readlines()
    stored_content = "".join(lines)

    header_lines, body_lines = split_share_file_lines(lines)
    headers = parse_share_header_lines(header_lines)
    template_type = headers["template_type"]
    language = headers["language"]
    theme = headers["theme"]
    owner_user_id = headers["owner_user_id"]
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
        "admin_share_path": f"/share/{project_id}?{ADMIN_SHARE_ACCESS_PARAM}=1",
        "qr_path": qr_path if os.path.isfile(qr_path) else "",
        "has_project_markers": parsed_project.get("has_markers", False),
        "user_deleted_at": headers["user_deleted_at"],
        "user_deleted_by": headers["user_deleted_by"],
        "admin_deleted_at": headers["admin_deleted_at"],
        "admin_deleted_by": headers["admin_deleted_by"],
    }
    enrich_share_deletion_state(record)

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
                "user_deleted_at": headers["user_deleted_at"],
                "user_deleted_by": headers["user_deleted_by"],
                "admin_deleted_at": headers["admin_deleted_at"],
                "admin_deleted_by": headers["admin_deleted_by"],
            },
        })

    return record


def list_shared_code_records(
    query="",
    owner_user_id=None,
    include_deleted=False,
    trash_only=False,
    include_expired_user_deleted=False,
):
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
        if trash_only:
            if not record.get("user_trash_is_recoverable"):
                continue
        elif not include_deleted and record.get("is_deleted"):
            continue
        elif not include_expired_user_deleted and normalized_owner_user_id is not None:
            if record.get("is_user_deleted") and record.get("user_delete_is_expired"):
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


def update_share_file_metadata(project_id, updates):
    record = get_shared_code_record(project_id)
    if not record:
        return False
    storage_path = record.get("storage_path")
    if not storage_path or not os.path.isfile(storage_path):
        return False

    with open(storage_path, "r", encoding="utf-8") as share_file:
        lines = share_file.readlines()
    header_lines, body_lines = split_share_file_lines(lines)

    written_markers = set()
    next_header_lines = []
    for line in header_lines:
        line_marker = next((marker for marker in updates if line.startswith(marker)), None)
        if not line_marker:
            next_header_lines.append(line)
            continue
        written_markers.add(line_marker)
        next_value = updates[line_marker]
        if next_value is None:
            continue
        next_header_lines.append(f"{line_marker}{next_value}\n")

    for marker, value in updates.items():
        if marker in written_markers or value is None:
            continue
        next_header_lines.append(f"{marker}{value}\n")

    temp_path = f"{storage_path}.tmp"
    with open(temp_path, "w", encoding="utf-8") as share_file:
        share_file.writelines(next_header_lines)
        share_file.writelines(body_lines)
    os.replace(temp_path, storage_path)
    return True


def mark_shared_code_record_user_deleted(project_id, owner_user_id):
    record = get_shared_code_record(project_id)
    if not record:
        return False

    try:
        normalized_owner_user_id = int(owner_user_id)
    except (TypeError, ValueError):
        return False
    if record.get("owner_user_id") != normalized_owner_user_id:
        return False

    if record.get("is_admin_deleted"):
        return False

    deleted_at = format_share_metadata_datetime(timezone.now())
    return update_share_file_metadata(project_id, {
        USER_DELETED_AT_MARKER: deleted_at,
        USER_DELETED_BY_MARKER: str(normalized_owner_user_id),
    })


def restore_user_deleted_share(project_id, owner_user_id):
    record = get_shared_code_record(project_id)
    if not record:
        return False
    try:
        normalized_owner_user_id = int(owner_user_id)
    except (TypeError, ValueError):
        return False
    if record.get("owner_user_id") != normalized_owner_user_id:
        return False
    if not record.get("user_trash_is_recoverable"):
        return False
    return update_share_file_metadata(project_id, {
        USER_DELETED_AT_MARKER: None,
        USER_DELETED_BY_MARKER: None,
    })


def mark_shared_code_record_admin_deleted(project_id, admin_user_id=None):
    if not get_shared_code_record(project_id):
        return False
    deleted_at = format_share_metadata_datetime(timezone.now())
    updates = {ADMIN_DELETED_AT_MARKER: deleted_at}
    if admin_user_id is not None:
        updates[ADMIN_DELETED_BY_MARKER] = str(admin_user_id)
    return update_share_file_metadata(project_id, updates)


def restore_shared_code_record(project_id):
    if not get_shared_code_record(project_id):
        return False
    return update_share_file_metadata(project_id, {
        USER_DELETED_AT_MARKER: None,
        USER_DELETED_BY_MARKER: None,
        ADMIN_DELETED_AT_MARKER: None,
        ADMIN_DELETED_BY_MARKER: None,
    })


def hard_delete_shared_code_record(project_id):
    record = get_shared_code_record(project_id)
    if not record:
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


def delete_shared_code_record(project_id, owner_user_id=None):
    return mark_shared_code_record_user_deleted(project_id, owner_user_id)
