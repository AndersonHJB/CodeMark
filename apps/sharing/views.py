import datetime
import io
import json
import os
import re
import uuid
import zipfile

from django.conf import settings
from django.contrib import admin, messages
from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import qrcode

from apps.common.project_payload import (
    DEFAULT_CODE_THEME,
    THEME_MARKER,
    decode_base64_payload,
    default_filename_for_language,
    detect_language_from_filename,
    get_project_payload_for_download,
    normalize_language,
    normalize_project_relative_path,
    normalize_theme,
    persist_project_payload,
    sanitize_download_filename,
    write_zip_bytes,
    write_zip_folder,
)
from apps.common.responsive import is_mobile_request
from apps.common.runtime import (
    build_url,
    django_view,
    jsonify,
    render_page,
    request,
    send_file,
    send_from_directory,
)
from apps.sharing.share_files import (
    ADMIN_SHARE_ACCESS_PARAM,
    OWNER_ID_MARKER,
    delete_shared_code_record,
    estimate_share_upload_storage_bytes,
    format_storage_bytes,
    get_shared_code_record,
    get_user_share_storage_summary,
    hard_delete_shared_code_record,
    list_shared_code_records,
    mark_shared_code_record_admin_deleted,
    restore_shared_code_record,
    restore_user_deleted_share,
    SHARE_TRASH_RETENTION_DAYS,
    user_share_storage_can_accept,
)


def _share_owner_header_lines():
    user = getattr(request, "user", None)
    if user and user.is_authenticated and user.pk:
        return [f"{OWNER_ID_MARKER}{user.pk}"]
    return []


def _has_admin_share_access():
    user = getattr(request, "user", None)
    return bool(
        user
        and user.is_authenticated
        and user.is_staff
        and request.GET.get(ADMIN_SHARE_ACCESS_PARAM)
    )


def _assets_for_share_access(assets, admin_access=False):
    next_assets = []
    for asset in assets or []:
        next_asset = dict(asset)
        if admin_access and next_asset.get("admin_url"):
            next_asset["url"] = next_asset["admin_url"]
        next_assets.append(next_asset)
    return next_assets


def _share_storage_limit_response(storage_summary, incoming_bytes):
    payload = {
        "ok": False,
        "error": "share_storage_quota_exceeded",
        "message": (
            "分享空间不足：已使用 "
            f"{storage_summary['used_display']} / {storage_summary['limit_display']}，"
            f"本次预计需要 {format_storage_bytes(incoming_bytes)}。请删除旧分享或联系管理员扩容。"
        ),
        "storage": {
            "used_bytes": storage_summary["used_bytes"],
            "limit_bytes": storage_summary["limit_bytes"],
            "used_display": storage_summary["used_display"],
            "limit_display": storage_summary["limit_display"],
            "available_display": storage_summary["available_display"],
        },
    }
    response = jsonify(payload)
    response.status_code = 413
    return response


@django_view
def sharecode():
    """
    直接访问 /sharecode 时，如果没带任何参数，就给它一个空字符串，用于编辑器初始化。
    使用不执行 Python 的模板 sharecode.html。
    """
    return render_page(
        'sharecode.html',
        pre_code="",
        pre_lang="python",
        pre_theme=DEFAULT_CODE_THEME,
        pre_project=None,
        share_project_id="",
        is_mobile=is_mobile_request()
    )


@csrf_exempt
@django_view
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
    owner_header_lines = _share_owner_header_lines()

    # 生成一个唯一 ID
    unique_id = str(uuid.uuid4())
    # 时间戳
    timestamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
    # 拼接最终 project_id
    project_id = unique_id + "_" + timestamp

    if request.user.is_authenticated:
        incoming_storage_bytes = estimate_share_upload_storage_bytes(
            code=code,
            template_type=template_type,
            language=language,
            theme=theme,
            project_payload=project_payload,
            extra_header_lines=owner_header_lines,
        )
        can_accept, storage_summary = user_share_storage_can_accept(request.user, incoming_storage_bytes)
        if not can_accept:
            return _share_storage_limit_response(storage_summary, incoming_storage_bytes)
    else:
        incoming_storage_bytes = 0

    # 1. 先拼装 media/sharecode/<yearmonth>/ 路径
    yearmonth = datetime.datetime.now().strftime('%Y%m')
    month_folder = os.path.join(settings.CODEMARK_SHARECODE_DIR, yearmonth)
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
            extra_header_lines=owner_header_lines,
        )
    else:
        # 兼容原单文件存储格式
        with open(code_file_path, 'w', encoding='utf-8') as f:
            f.write(f"__TEMPLATE__={template_type}\n")
            f.write(f"__LANG__={language}\n")
            f.write(f"{THEME_MARKER}{theme}\n")
            for header_line in owner_header_lines:
                f.write(f"{header_line}\n")
            f.write(code)

    # 3. 生成二维码并保存在 media/sharecode/images 文件夹
    images_folder = os.path.join(settings.CODEMARK_SHARECODE_DIR, 'images')
    os.makedirs(images_folder, exist_ok=True)

    # 构造可分享链接，比如 http://127.0.0.1:5000/share/<project_id>
    # 如果你有域名，可用: https://yourdomain.com/share/<project_id>
    # share_link = request.host_url.strip('/') + "/share/" + project_id
    share_link = build_url('show_shared_code', project_id=project_id, _external=True)  # 可以强制 https: _scheme='https'
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(share_link)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    img_file_path = os.path.join(images_folder, project_id + ".png")
    img.save(img_file_path)

    if request.user.is_authenticated:
        storage_summary = get_user_share_storage_summary(request.user)
        if storage_summary["limit_bytes"] is not None and storage_summary["used_bytes"] > storage_summary["limit_bytes"]:
            hard_delete_shared_code_record(project_id)
            return _share_storage_limit_response(storage_summary, incoming_storage_bytes)

    # 返回给前端
    return jsonify({
        "ok": True,
        "project_id": project_id,
        "share_link": share_link,
    })


@csrf_exempt
@django_view
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
                        source_abs_path = os.path.join(
                            settings.CODEMARK_SHARECODE_DIR,
                            "assets",
                            source_project_id,
                            source_stored_path,
                        )
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


@django_view
def get_shared_asset(project_id, asset_path):
    safe_asset_path = normalize_project_relative_path(asset_path)
    if not safe_asset_path:
        return HttpResponse("File not found", status=404)
    record = get_shared_code_record(project_id)
    if not record:
        return HttpResponse("File not found", status=404)
    if record.get("is_deleted") and not _has_admin_share_access():
        return HttpResponse("File not found", status=404)
    asset_root = os.path.join(settings.CODEMARK_SHARECODE_DIR, "assets", project_id)
    abs_asset_path = os.path.join(asset_root, safe_asset_path)
    if not os.path.isfile(abs_asset_path):
        return HttpResponse("File not found", status=404)
    return send_from_directory(asset_root, safe_asset_path)


@django_view
def show_shared_code(project_id):
    """
    当别人访问 /share/<project_id> 时，
    从本地 txt 文件读取对应代码的同时，也读取第一、二行以判断使用哪种模板和语言。
    """
    record = get_shared_code_record(project_id)
    if not record:
        return HttpResponse(f"File not found: {project_id}", status=404)

    admin_access = _has_admin_share_access()
    if record.get("is_deleted") and not admin_access:
        return HttpResponse(f"File not found: {project_id}", status=404)

    template_type = record.get("template_type") or "editor"
    lang = record.get("language") or "python"
    theme = record.get("theme") or DEFAULT_CODE_THEME
    code_content = record.get("raw_content", "")
    pre_project = None

    if record.get("has_project_markers"):
        text_files = record.get("text_files", [])
        if text_files:
            code_content = text_files[0].get("content", "")
            lang = normalize_language(text_files[0].get("language", lang) or lang, lang)
        else:
            code_content = ""
        pre_project = {
            "text_files": text_files,
            "assets": _assets_for_share_access(record.get("assets", []), admin_access=admin_access),
            "folders": record.get("folders", []),
            "active_file": text_files[0]["path"] if text_files else "",
        }
    elif template_type == "sharecode" and code_content:
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

    # 根据 template_type 来渲染不同的模板，并将 lang 也传过去
    if template_type == "sharecode":
        target_template = "sharecode.html"
    elif template_type == "cpp_editor":
        target_template = "cpp_editor.html"
        lang = normalize_language(lang, "c_cpp")
    else:
        target_template = "editor.html"
    if target_template == "sharecode.html":
        return render_page(
            target_template,
            pre_code=code_content,
            pre_lang=lang,
            pre_theme=theme,
            pre_project=pre_project,
            share_project_id=project_id,
            is_mobile=is_mobile_request()
        )

    return render_page(
        target_template,
        pre_code=code_content,
        pre_lang=lang,
        pre_theme=theme,
        pre_project=pre_project,
        share_project_id=project_id,
        is_mobile=is_mobile_request()
    )


@django_view
def account_share_links():
    query = request.GET.get("q", "")
    view_mode = request.GET.get("view", "")
    is_trash_view = view_mode == "trash"
    records = []
    active_count = 0
    trash_count = 0
    if request.user.is_authenticated:
        active_count = len(list_shared_code_records(owner_user_id=request.user.pk))
        trash_count = len(list_shared_code_records(owner_user_id=request.user.pk, trash_only=True))
        records = list_shared_code_records(
            query,
            owner_user_id=request.user.pk,
            trash_only=is_trash_view,
        )
        for record in records:
            record["share_url"] = request._current().build_absolute_uri(record["share_path"])
        storage_summary = get_user_share_storage_summary(request.user)
    else:
        storage_summary = get_user_share_storage_summary(None)

    return render(
        request._current(),
        "accounts/share_links.html",
        {
            "active_nav": "sharecode",
            "records": records,
            "record_count": active_count,
            "trash_count": trash_count,
            "visible_record_count": len(records),
            "query": query,
            "is_trash_view": is_trash_view,
            "share_trash_retention_days": SHARE_TRASH_RETENTION_DAYS,
            "storage_summary": storage_summary,
        },
    )


@require_POST
@django_view
def delete_account_share_link(project_id):
    if not request.user.is_authenticated:
        return redirect("account_share_links")

    deleted = delete_shared_code_record(project_id, owner_user_id=request.user.pk)
    if deleted:
        messages.success(request._current(), f"分享链接已移入回收站，{SHARE_TRASH_RETENTION_DAYS} 天内可恢复。")
    else:
        messages.error(request._current(), "没有找到可删除的分享链接。")
    return redirect("account_share_links")


@require_POST
@django_view
def restore_account_share_link(project_id):
    if not request.user.is_authenticated:
        return redirect("account_share_links")

    restored = restore_user_deleted_share(project_id, request.user.pk)
    if restored:
        messages.success(request._current(), "分享链接已恢复。")
        return redirect("account_share_links")
    messages.error(request._current(), "这个分享链接已超过回收站有效期或不可恢复。")
    return redirect("account_share_links")


@staff_member_required
@django_view
def admin_share_files():
    query = request.GET.get("q", "")
    records = list_shared_code_records(
        query,
        include_deleted=True,
        include_expired_user_deleted=True,
    )
    selected_project_id = request.GET.get("project_id", "")
    selected_record = None
    if selected_project_id:
        selected_record = get_shared_code_record(selected_project_id)
        if not selected_record:
            return redirect("admin_share_files")

    context = admin.site.each_context(request._current())
    context.update({
        "title": "分享文件后台",
        "records": records,
        "record_count": len(records),
        "query": query,
        "selected_record": selected_record,
    })
    return render(request._current(), "admin/share_files.html", context)


@staff_member_required
@require_POST
@django_view
def admin_share_files_bulk_action():
    action = request.form.get("action", "")
    project_ids = request.form.getlist("project_ids")
    changed_count = 0

    for project_id in project_ids:
        if action == "admin_delete":
            if mark_shared_code_record_admin_deleted(project_id, request.user.pk):
                changed_count += 1
        elif action == "restore":
            if restore_shared_code_record(project_id):
                changed_count += 1

    if not project_ids:
        messages.warning(request._current(), "请先选择分享文件。")
    elif action == "admin_delete":
        messages.success(request._current(), f"已将 {changed_count} 条分享移入后台回收站。")
    elif action == "restore":
        messages.success(request._current(), f"已恢复 {changed_count} 条分享。")
    else:
        messages.error(request._current(), "未识别的批量操作。")
    return redirect("admin_share_files")


@staff_member_required
@django_view
def admin_share_file_detail(project_id):
    record = get_shared_code_record(project_id)
    if not record:
        return HttpResponse(f"Share file not found: {project_id}", status=404)

    context = admin.site.each_context(request._current())
    context.update({
        "title": f"分享文件 {project_id}",
        "record": record,
    })
    return render(request._current(), "admin/share_file_detail.html", context)


@staff_member_required
@require_POST
@django_view
def admin_delete_share_file(project_id):
    deleted = mark_shared_code_record_admin_deleted(project_id, request.user.pk)
    if deleted:
        messages.success(request._current(), "分享文件已移入后台回收站。")
    else:
        messages.error(request._current(), "没有找到可删除的分享文件。")
    return redirect("admin_share_file_detail", project_id=project_id)


@staff_member_required
@require_POST
@django_view
def admin_restore_share_file(project_id):
    restored = restore_shared_code_record(project_id)
    if restored:
        messages.success(request._current(), "分享文件已恢复。")
    else:
        messages.error(request._current(), "没有找到可恢复的分享文件。")
    return redirect("admin_share_file_detail", project_id=project_id)


@staff_member_required
@require_POST
@django_view
def admin_hard_delete_share_file(project_id):
    deleted = hard_delete_shared_code_record(project_id)
    if deleted:
        messages.success(request._current(), "分享文件已永久删除。")
        return redirect("admin_share_files")
    messages.error(request._current(), "没有找到可永久删除的分享文件。")
    return redirect("admin_share_file_detail", project_id=project_id)
