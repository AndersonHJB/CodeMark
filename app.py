# -*- coding: utf-8 -*-
# @Time    : 2024/11/16 09:07
# @Author  : AI悦创
# @FileName: app.py
# @Software: PyCharm
# @Blog    ：https://bornforthis.cn/
# code is far away from bugs with the god animal protecting
#    I love animals. They taste delicious.
from flask import Flask, render_template, request, jsonify, url_for
import markdown
import os, re, random
import uuid
import datetime
import qrcode  # pip install qrcode[pil]
from flask_cors import CORS

app = Flask(__name__)
# app.config['SERVER_NAME'] = 'codemark.bornforthis.cn'  # 用于生成绝对 URL，可根据实际情况修改
# app.config['PREFERRED_URL_SCHEME'] = 'https' # 强制使用 https
# CORS(app, resources={r"/*": {"origins": ["https://blog.bornforthis.cn", "http://127.0.0.1:4000"]}})
# 允许任何来源访问
CORS(app, resources={r"/*": {"origins": "*"}})

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
@app.route('/editor')
def editor():
    """
    直接访问 /editor 时，如果没带任何参数，就给它一个空字符串，用于编辑器初始化。
    使用可执行 Python 的模板 editor.html。
    """
    # 获取 User-Agent
    user_agent = request.headers.get('User-Agent', '')
    if is_mobile(user_agent):
        # 如果是移动端，则渲染 mobile_editor.html（假设你有）
        return render_template('mobile_editor.html', pre_code="")
    else:
        # 否则渲染原本的 editor.html
        return render_template('editor.html', pre_code="", pre_lang="python")


@app.route('/sharecode')
def sharecode():
    """
    直接访问 /sharecode 时，如果没带任何参数，就给它一个空字符串，用于编辑器初始化。
    使用不执行 Python 的模板 sharecode.html。
    """
    # 默认语言也可以是 python 或其他，看你需求
    return render_template('sharecode.html', pre_code="", pre_lang="python")


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
    language = request.form.get('language', '')
    # 新增获取模板类型（默认用 editor）
    template_type = request.form.get('template', 'editor')

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

    # 2. 将代码写入本地 txt 文件
    #   文件第一行写入 "__TEMPLATE__=<template_type>"
    #   第二行写入 "__LANG__=<language>"
    #   第三行开始写实际的 code 内容
    code_file_path = os.path.join(month_folder, project_id + ".txt")
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
    print(f"share_link: {share_link}")
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


@app.route('/share/<project_id>')
def show_shared_code(project_id):
    """
    当别人访问 /share/<project_id> 时，
    从本地 txt 文件读取对应代码的同时，也读取第一、二行以判断使用哪种模板和语言。
    """
    code_content = "File not found or removed."
    template_type = "editor"  # 默认使用 editor
    lang = "python"  # 默认 python
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

                # 从第三行起才是代码
                code_content = "".join(lines[2:])
                break

    if not found:
        return f"File not found: {project_id}", 404

    # 根据 template_type 来渲染不同的模板，并将 lang 也传过去
    if template_type == "sharecode":
        return render_template('sharecode.html', pre_code=code_content, pre_lang=lang)
    else:
        # 默认为 editor
        return render_template('editor.html', pre_code=code_content, pre_lang=lang)


if __name__ == '__main__':
    # app.run(debug=True)
    app.run(host="0.0.0.0", port=8991)