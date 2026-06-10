import os
import random
import re

from django.conf import settings
from django.http import HttpResponse
import markdown

from apps.common.runtime import django_view, render_page


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


def build_directory_tree(root_dir, relative_path="", current_file=""):
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
        'subdirs_list': [],
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
        file_path = "/".join(part for part in (relative_path, f) if part)
        tree['files'].append({
            'filename': f,
            'path': file_path,
            'title': get_title_from_filename(f),
            'is_active': file_path == current_file,
        })

    # 递归处理子目录
    for d in dirs:
        subdir_path = os.path.join(root_dir, d)
        subdir_relative_path = "/".join(part for part in (relative_path, d) if part)
        # 这里直接递归构建子目录结构
        subdir_tree = build_directory_tree(subdir_path, subdir_relative_path, current_file)
        tree['subdirs'][d] = subdir_tree
        tree['subdirs_list'].append({
            'dirname': d,
            'path': subdir_relative_path,
            'tree': subdir_tree,
            'is_open': bool(current_file and current_file.startswith(subdir_relative_path)),
            'delay_ms': 240 + len(tree['subdirs_list']) * 80,
        })

    return tree


def build_article_meta(meta):
    return {
        "title": (meta.get("title") or ["无标题"])[0],
        "author": (meta.get("author") or [""])[0],
        "date": (meta.get("date") or [""])[0],
        "categories": [item.lstrip("-") for item in meta.get("category", []) if item.lstrip("-")],
        "tags": [item.lstrip("-") for item in meta.get("tag", []) if item.lstrip("-")],
    }


@django_view
def index():
    """
    新版主页：遍历 'articles' 目录，将其按目录分组后，在首页以类别的形式展示
    """
    # 构建整个 articles 文件夹的目录树
    directory_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR)
    # 传给模板做展示
    return render_page('index.html', directory_tree=directory_tree)


@django_view
def article(filename):
    """
    文章阅读页面。
    1. 根据 filename 打开指定 .md 文件，渲染为 HTML。
    2. 同时也把目录树传给 article.html，用以在左侧显示 VuePress 风格 sidebar。
    3. 将 current_file=filename 传递给模板，用于高亮当前文章并展开所在目录。
    """
    full_path = os.path.join(settings.CODEMARK_ARTICLES_DIR, filename)
    if not os.path.isfile(full_path):
        return HttpResponse(f"File not found: {filename}", status=404)

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
    directory_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR, current_file=filename)

    return render_page('article.html',
                       content=html_content,
                       toc=toc,
                       directory_tree=directory_tree,
                       current_file=filename,
                       meta=build_article_meta(meta))
