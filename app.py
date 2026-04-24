# -*- coding: utf-8 -*-
# @Time    : 2024/11/16 09:07
# @Author  : AI悦创
# @FileName: app.py
# @Software: PyCharm
# @Blog    ：https://bornforthis.cn/
# code is far away from bugs with the god animal protecting
#    I love animals. They taste delicious.
from flask import Flask, render_template, request, jsonify, url_for, send_from_directory
import markdown
import base64
import json
import os, re, random
import shutil
import uuid
import datetime
import qrcode  # pip install qrcode[pil]

app = Flask(__name__)


# app.config['SERVER_NAME'] = 'codemark.bornforthis.cn'  # 用于生成绝对 URL，可根据实际情况修改
# app.config['PREFERRED_URL_SCHEME'] = 'https' # 强制使用 https

FILENAME_MARKER = "__FILENAME___="
ASSET_MARKER = "__ASSET___="
FOLDER_MARKER = "__FOLDER___="

LANGUAGE_FILE_EXTENSIONS = {
    "python": "py",
    "javascript": "js",
    "c_cpp": "cpp",
    "java": "java",
    "php": "php",
    "ruby": "rb",
    "golang": "go",
    "html": "html",
    "css": "css",
    "markdown": "md",
}

EXTENSION_LANGUAGE_MAP = {
    "py": "python",
    "js": "javascript",
    "c": "c_cpp",
    "cc": "c_cpp",
    "cpp": "c_cpp",
    "cxx": "c_cpp",
    "h": "c_cpp",
    "hpp": "c_cpp",
    "java": "java",
    "php": "php",
    "rb": "ruby",
    "go": "golang",
    "html": "html",
    "htm": "html",
    "css": "css",
    "md": "markdown",
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


def ensure_assets_prefix(path: str) -> str:
    """统一将非代码文件放入 assets/ 前缀目录。"""
    safe_path = normalize_project_relative_path(path)
    if not safe_path:
        return ""
    if safe_path.startswith("assets/"):
        return safe_path
    return f"assets/{safe_path}"


def detect_language_from_filename(filename: str) -> str:
    safe_name = normalize_project_relative_path(filename)
    if not safe_name:
        return "python"
    basename = os.path.basename(safe_name)
    if "." not in basename:
        return "python"
    ext = basename.rsplit(".", 1)[1].lower()
    return EXTENSION_LANGUAGE_MAP.get(ext, "python")


def default_filename_for_language(language: str) -> str:
    ext = LANGUAGE_FILE_EXTENSIONS.get((language or "").lower(), "txt")
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


def parse_project_sections(body_lines, project_id=None):
    """
    解析 sharecode 文本中的多文件标记。
    若不存在标记，则 has_markers=False，raw_content 为原文本。
    """
    has_markers = any(
        line.startswith(FILENAME_MARKER) or line.startswith(ASSET_MARKER) or line.startswith(FOLDER_MARKER)
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
    current_content_lines = []

    def flush_current_file():
        nonlocal current_path, current_language, current_content_lines
        if not current_path:
            current_content_lines = []
            return
        text_files.append({
            "path": current_path,
            "content": "".join(current_content_lines),
            "language": current_language,
        })
        current_path = None
        current_language = "python"
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


def persist_project_payload(code_file_path, template_type, language, code, project_payload, project_id):
    """将单文件或多文件项目写入 sharecode 文本，并持久化资源文件。"""
    project_data = project_payload if isinstance(project_payload, dict) else {}

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
            text_files.append({
                "path": safe_path,
                "content": content,
                "language": detect_language_from_filename(safe_path),
            })

    if not text_files and not folders:
        fallback_path = default_filename_for_language(language)
        text_files.append({
            "path": fallback_path,
            "content": code or "",
            "language": detect_language_from_filename(fallback_path),
        })

    asset_folder = os.path.join("sharecode", "assets", project_id)
    os.makedirs(asset_folder, exist_ok=True)

    assets_meta = []
    incoming_assets = project_data.get("assets", [])
    if isinstance(incoming_assets, list):
        for idx, asset_item in enumerate(incoming_assets):
            if not isinstance(asset_item, dict):
                continue

            safe_logical_path = ensure_assets_prefix(
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
        for folder_path in folders:
            f.write(f"{FOLDER_MARKER}{folder_path}\n")
        for text_file in text_files:
            f.write(f"{FILENAME_MARKER}{text_file['path']}\n")
            f.write(text_file["content"])
            if not text_file["content"].endswith("\n"):
                f.write("\n")
        for asset_item in assets_meta:
            f.write(
                f"{ASSET_MARKER}{asset_item['path']}|{asset_item['stored_path']}|"
                f"{asset_item['mime_type']}|{asset_item['size']}\n"
            )

    return text_files, assets_meta

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
    language = (request.form.get('language', '') or "python").strip().lower()
    # 新增获取模板类型（默认用 editor）
    template_type = request.form.get('template', 'editor')
    project_payload_raw = request.form.get('project_payload', '')
    project_payload = None
    if project_payload_raw:
        try:
            project_payload = json.loads(project_payload_raw)
        except Exception:
            project_payload = None

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
    if template_type == "sharecode" and isinstance(project_payload, dict):
        persist_project_payload(
            code_file_path=code_file_path,
            template_type=template_type,
            language=language,
            code=code,
            project_payload=project_payload,
            project_id=project_id,
        )
    else:
        # 兼容原单文件存储格式
        with open(code_file_path, 'w', encoding='utf-8') as f:
            f.write(f"__TEMPLATE__={template_type}\n")
            f.write(f"__LANG__={language}\n")
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

                # 第一行: __TEMPLATE__=xxx
                if lines and lines[0].startswith("__TEMPLATE__="):
                    template_type = lines[0].split("=", 1)[1].strip()
                # 第二行: __LANG__=xxx
                if len(lines) > 1 and lines[1].startswith("__LANG__="):
                    lang = lines[1].split("=", 1)[1].strip()

                body_lines = lines[2:]
                parsed_project = parse_project_sections(body_lines, project_id=project_id)
                if parsed_project["has_markers"]:
                    text_files = parsed_project["text_files"]
                    assets = parsed_project["assets"]
                    folders = parsed_project.get("folders", [])
                    if text_files:
                        code_content = text_files[0]["content"]
                        lang = text_files[0].get("language", lang) or lang
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
                    if template_type == "sharecode":
                        fallback_path = default_filename_for_language(lang)
                        pre_project = {
                            "text_files": [{
                                "path": fallback_path,
                                "content": code_content,
                                "language": detect_language_from_filename(fallback_path),
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
            pre_project=pre_project,
            share_project_id=project_id,
            is_mobile=is_mobile_request()
        )

    return render_template(
        target_template,
        pre_code=code_content,
        pre_lang=lang,
        is_mobile=is_mobile_request()
    )


if __name__ == '__main__':
    # app.run(debug=True)
    app.run(host="0.0.0.0", port=8991)
