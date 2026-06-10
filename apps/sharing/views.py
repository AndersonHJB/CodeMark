import datetime
import io
import json
import os
import re
import uuid
import zipfile

from django.conf import settings
from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
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
    parse_project_sections,
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
from apps.sharing.share_files import get_shared_code_record, list_shared_code_records


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

    # 生成一个唯一 ID
    unique_id = str(uuid.uuid4())
    # 时间戳
    timestamp = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
    # 拼接最终 project_id
    project_id = unique_id + "_" + timestamp

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
        )
    else:
        # 兼容原单文件存储格式
        with open(code_file_path, 'w', encoding='utf-8') as f:
            f.write(f"__TEMPLATE__={template_type}\n")
            f.write(f"__LANG__={language}\n")
            f.write(f"{THEME_MARKER}{theme}\n")
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

    # 返回给前端
    return jsonify({
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
    code_content = "File not found or removed."
    template_type = "editor"  # 默认使用 editor
    lang = "python"  # 默认 python
    theme = DEFAULT_CODE_THEME
    pre_project = None
    sharecode_root = settings.CODEMARK_SHARECODE_DIR
    found = False

    if not os.path.isdir(sharecode_root):
        return HttpResponse(f"File not found: {project_id}", status=404)

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
        return HttpResponse(f"File not found: {project_id}", status=404)

    # 根据 template_type 来渲染不同的模板，并将 lang 也传过去
    target_template = 'sharecode.html' if template_type == "sharecode" else 'editor.html'
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


@staff_member_required
@django_view
def admin_share_files():
    query = request.GET.get("q", "")
    records = list_shared_code_records(query)
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
