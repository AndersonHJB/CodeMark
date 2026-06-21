import os
import re

from django.conf import settings
from django.http import HttpResponse
import markdown

from apps.common.runtime import django_view, render_page


def parse_sort_key(filename):
    """
    如果文件名以数字开头，则按数字排序，否则按名称稳定排序。
    示例：
        01-hello.md -> sort_key = 1
        10-world.md -> sort_key = 10
        readme.md   -> sort_key = readme.md
    """
    match = re.match(r'^(\d+)', filename)
    if match:
        return 0, int(match.group(1)), filename.casefold()
    return 1, filename.casefold()


def is_path_under(path, parent_path):
    if not path or not parent_path:
        return False
    return path == parent_path or path.startswith(f"{parent_path}/")


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
        'files': [],
        'article_count': 0,
        'first_article_path': '',
    }

    if not os.path.isdir(root_dir):
        return tree

    # 获取当前目录下的所有条目
    entries = os.listdir(root_dir)
    # 先把目录和文件分开
    dirs = sorted([d for d in entries if os.path.isdir(os.path.join(root_dir, d))], key=parse_sort_key)
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

    tree['article_count'] = len(tree['files'])
    if tree['files']:
        tree['first_article_path'] = tree['files'][0]['path']

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
            'is_open': is_path_under(current_file, subdir_relative_path),
            'delay_ms': 240 + len(tree['subdirs_list']) * 80,
            'article_count': subdir_tree['article_count'],
            'first_article_path': subdir_tree['first_article_path'],
        })
        tree['article_count'] += subdir_tree['article_count']
        if not tree['first_article_path'] and subdir_tree['first_article_path']:
            tree['first_article_path'] = subdir_tree['first_article_path']

    return tree


def get_article_collections(directory_tree):
    return directory_tree.get('subdirs_list', [])


def get_current_collection(directory_tree, filename):
    collection_path = filename.split("/", 1)[0] if filename else ""
    for collection in get_article_collections(directory_tree):
        if collection.get('path') == collection_path:
            return collection
    return None


def get_safe_article_path(filename):
    article_root = os.path.abspath(settings.CODEMARK_ARTICLES_DIR)
    full_path = os.path.abspath(os.path.join(article_root, filename))
    if os.path.commonpath([article_root, full_path]) != article_root:
        return None
    return full_path


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
    新版主页：遍历文章内容目录，将一级目录作为专栏展示。
    """
    directory_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR)
    return render_page('index.html',
                       directory_tree=directory_tree,
                       article_collections=get_article_collections(directory_tree))


@django_view
def article(filename):
    """
    文章阅读页面。
    1. 根据 filename 打开指定 .md 文件，渲染为 HTML。
    2. 同时也把目录树传给 article.html，用以在左侧显示 VuePress 风格 sidebar。
    3. 将 current_file=filename 传递给模板，用于高亮当前文章并展开所在目录。
    """
    full_path = get_safe_article_path(filename)
    if not full_path or not os.path.isfile(full_path):
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

    # 构建目录树；文章页左侧只渲染当前专栏自己的目录树。
    directory_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR, current_file=filename)
    article_collections = get_article_collections(directory_tree)
    current_collection = get_current_collection(directory_tree, filename)
    sidebar_tree = current_collection['tree'] if current_collection else directory_tree
    sidebar_title = current_collection['dirname'] if current_collection else '未归入专栏'

    return render_page('article.html',
                       content=html_content,
                       toc=toc,
                       directory_tree=directory_tree,
                       article_collections=article_collections,
                       current_collection=current_collection,
                       sidebar_tree=sidebar_tree,
                       sidebar_title=sidebar_title,
                       sidebar_article_count=sidebar_tree.get('article_count', 0),
                       current_file=filename,
                       meta=build_article_meta(meta))
