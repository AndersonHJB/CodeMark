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
    decode_base64_payload,
    default_filename_for_language,
    detect_language_from_filename,
    normalize_language,
    normalize_project_relative_path,
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
DEFAULT_NON_MEMBER_SHARE_STORAGE_BYTES = 100 * 1024 * 1024
SHARE_STORAGE_QR_ESTIMATE_BYTES = 64 * 1024
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


def format_storage_bytes(byte_count):
    value = max(0, int(byte_count or 0))
    units = ("B", "KB", "MB", "GB", "TB")
    size = float(value)
    unit = units[0]
    for next_unit in units[1:]:
        if size < 1024:
            break
        size /= 1024
        unit = next_unit
    if unit == "B":
        return f"{value} B"
    if size >= 100 or size.is_integer():
        return f"{size:.0f} {unit}"
    return f"{size:.1f} {unit}"


def _file_size_if_exists(file_path):
    try:
        return os.path.getsize(file_path) if file_path and os.path.isfile(file_path) else 0
    except OSError:
        return 0


def _directory_size(directory_path):
    if not directory_path or not os.path.isdir(directory_path):
        return 0
    total_size = 0
    for root, _, files in os.walk(directory_path):
        for file_name in files:
            total_size += _file_size_if_exists(os.path.join(root, file_name))
    return total_size


def _custom_share_quota_is_active(profile):
    if not profile or profile.share_storage_quota_mb is None:
        return False
    expires_at = profile.share_storage_quota_expires_at
    return not expires_at or timezone.now() < expires_at


def get_user_share_storage_policy(user, profile=None):
    if not user or not getattr(user, "is_authenticated", False):
        return {
            "limit_bytes": None,
            "limit_source": "guest",
            "limit_label": "未登录用户",
            "expires_at": None,
            "is_unlimited": True,
            "is_custom": False,
        }

    if profile is None:
        try:
            profile = user.codemark_profile
        except Exception:
            profile = None

    if _custom_share_quota_is_active(profile):
        limit_bytes = int(profile.share_storage_quota_mb or 0) * 1024 * 1024
        return {
            "limit_bytes": limit_bytes,
            "limit_source": "custom",
            "limit_label": "后台配置空间",
            "expires_at": profile.share_storage_quota_expires_at,
            "is_unlimited": False,
            "is_custom": True,
        }

    if getattr(user, "is_staff", False) or bool(profile and (profile.is_vip or profile.is_permanent_vip)):
        return {
            "limit_bytes": None,
            "limit_source": "member",
            "limit_label": "会员不限额",
            "expires_at": None,
            "is_unlimited": True,
            "is_custom": False,
        }

    return {
        "limit_bytes": DEFAULT_NON_MEMBER_SHARE_STORAGE_BYTES,
        "limit_source": "default",
        "limit_label": "非会员默认空间",
        "expires_at": None,
        "is_unlimited": False,
        "is_custom": False,
    }


def get_share_record_storage_bytes(record):
    if not record:
        return 0
    project_id = record.get("project_id", "")
    total_size = _file_size_if_exists(record.get("storage_path"))
    total_size += _file_size_if_exists(record.get("qr_path"))
    if project_id and SHARE_PROJECT_ID_PATTERN.fullmatch(project_id):
        total_size += _directory_size(os.path.join(settings.CODEMARK_SHARECODE_DIR, "assets", project_id))
    return total_size


def get_user_share_storage_usage(owner_user_id):
    if owner_user_id is None:
        return 0
    total_size = 0
    for record in list_shared_code_records(
        owner_user_id=owner_user_id,
        include_deleted=True,
        include_expired_user_deleted=True,
    ):
        total_size += get_share_record_storage_bytes(record)
    return total_size


def get_user_share_storage_summary(user, profile=None):
    policy = get_user_share_storage_policy(user, profile=profile)
    used_bytes = get_user_share_storage_usage(getattr(user, "pk", None)) if getattr(user, "is_authenticated", False) else 0
    limit_bytes = policy["limit_bytes"]
    if limit_bytes is None:
        percent = 0
        available_bytes = None
    elif limit_bytes <= 0:
        percent = 100 if used_bytes else 0
        available_bytes = 0
    else:
        percent = min(100, round((used_bytes / limit_bytes) * 100, 1))
        available_bytes = max(0, limit_bytes - used_bytes)
    summary = {
        **policy,
        "used_bytes": used_bytes,
        "available_bytes": available_bytes,
        "percent": percent,
        "percent_label": f"{percent:g}%",
        "used_display": format_storage_bytes(used_bytes),
        "limit_display": "不限额" if limit_bytes is None else format_storage_bytes(limit_bytes),
        "available_display": "不限额" if available_bytes is None else format_storage_bytes(available_bytes),
        "is_quota_exceeded": bool(limit_bytes is not None and used_bytes > limit_bytes),
    }
    summary["usage_display"] = (
        f"{summary['used_display']} / {summary['limit_display']}"
        if limit_bytes is not None
        else f"{summary['used_display']} / 不限额"
    )
    return summary


def _estimate_base64_payload_size(raw_payload):
    if not isinstance(raw_payload, str):
        return 0
    payload = raw_payload.strip()
    if not payload:
        return 0
    if "," in payload:
        payload = payload.split(",", 1)[1]
    payload = "".join(payload.split())
    if not payload:
        return 0
    padding = payload.count("=")
    return max(0, (len(payload) * 3) // 4 - padding)


def _estimate_source_asset_size(asset_item):
    source_project_id = asset_item.get("source_project_id")
    source_stored_path = normalize_project_relative_path(asset_item.get("source_stored_path", ""))
    if not (
        isinstance(source_project_id, str)
        and SHARE_PROJECT_ID_PATTERN.fullmatch(source_project_id)
        and source_stored_path
    ):
        return 0
    source_abs_path = os.path.join(
        settings.CODEMARK_SHARECODE_DIR,
        "assets",
        source_project_id,
        source_stored_path,
    )
    return _file_size_if_exists(source_abs_path)


def estimate_share_upload_storage_bytes(code, template_type, language, theme, project_payload=None, extra_header_lines=None):
    header_lines = [
        f"{SHARE_TEMPLATE_MARKER}{template_type}\n",
        f"{SHARE_LANGUAGE_MARKER}{language}\n",
        f"{THEME_MARKER}{theme}\n",
    ]
    for header_line in extra_header_lines or []:
        clean_header_line = str(header_line).rstrip("\r\n")
        if clean_header_line:
            header_lines.append(f"{clean_header_line}\n")

    text_bytes = sum(len(line.encode("utf-8")) for line in header_lines)
    asset_bytes = 0

    if isinstance(project_payload, dict):
        incoming_folders = project_payload.get("folders", [])
        if isinstance(incoming_folders, list):
            for folder_path in incoming_folders:
                text_bytes += len(f"__FOLDER___={folder_path}\n".encode("utf-8"))

        incoming_text_files = project_payload.get("text_files", [])
        if isinstance(incoming_text_files, list):
            for idx, file_item in enumerate(incoming_text_files):
                if not isinstance(file_item, dict):
                    continue
                path = file_item.get("path") or file_item.get("name") or f"file_{idx + 1}.txt"
                file_language = file_item.get("language") or language
                raw_content = file_item.get("content", "")
                content = raw_content if isinstance(raw_content, str) else str(raw_content)
                text_bytes += len(f"__FILENAME___={path}\n".encode("utf-8"))
                text_bytes += len(f"__FILE_LANG___={file_language}\n".encode("utf-8"))
                text_bytes += len(content.encode("utf-8")) + (0 if content.endswith("\n") else 1)

        incoming_assets = project_payload.get("assets", [])
        if isinstance(incoming_assets, list):
            for idx, asset_item in enumerate(incoming_assets):
                if not isinstance(asset_item, dict):
                    continue
                path = asset_item.get("path") or asset_item.get("name") or f"asset_{idx + 1}"
                data_base64 = asset_item.get("data_base64")
                if isinstance(data_base64, str) and data_base64.strip():
                    asset_size = _estimate_base64_payload_size(data_base64)
                    if not asset_size:
                        decoded_bytes = decode_base64_payload(data_base64)
                        asset_size = len(decoded_bytes) if decoded_bytes is not None else 0
                else:
                    asset_size = _estimate_source_asset_size(asset_item)
                    if not asset_size:
                        try:
                            asset_size = int(asset_item.get("size") or 0)
                        except (TypeError, ValueError):
                            asset_size = 0
                asset_bytes += max(0, asset_size)
                text_bytes += len(f"__ASSET___={path}|{path}|application/octet-stream|{asset_size}\n".encode("utf-8"))
    else:
        text_bytes += len((code or "").encode("utf-8"))

    return text_bytes + asset_bytes + SHARE_STORAGE_QR_ESTIMATE_BYTES


def user_share_storage_can_accept(user, incoming_bytes, profile=None):
    summary = get_user_share_storage_summary(user, profile=profile)
    limit_bytes = summary["limit_bytes"]
    if limit_bytes is None:
        return True, summary
    return summary["used_bytes"] + max(0, int(incoming_bytes or 0)) <= limit_bytes, summary


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
