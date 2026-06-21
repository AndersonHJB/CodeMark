import os
import json
import re

from django.conf import settings
from django.contrib import admin, messages
from django.contrib.admin.views.decorators import staff_member_required
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import redirect, render
import markdown

from apps.common.runtime import django_view, render_page, request
from .models import ArticleSidebarItem


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


def normalize_markdown_title(raw_title):
    if not raw_title:
        return ""

    title = str(raw_title).strip().strip('"\'')
    return title.strip()


def get_title_from_markdown_content(content):
    lines = content.splitlines()
    if not lines:
        return ""

    first_line = lines[0].strip()
    if first_line == "---":
        for line in lines[1:]:
            stripped = line.strip()
            if stripped in {"---", "..."}:
                break
            title_match = re.match(r"^title\s*:\s*(.+?)\s*$", line, re.IGNORECASE)
            if title_match:
                return normalize_markdown_title(title_match.group(1))
    else:
        for line in lines:
            stripped = line.strip()
            if not stripped:
                break
            title_match = re.match(r"^title\s*:\s*(.+?)\s*$", line, re.IGNORECASE)
            if title_match:
                return normalize_markdown_title(title_match.group(1))

    for line in lines:
        heading_match = re.match(r"^\s*#\s+(.+?)\s*#*\s*$", line)
        if heading_match:
            return normalize_markdown_title(heading_match.group(1))

    return ""


def get_title_from_markdown_file(file_path, filename):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            title = get_title_from_markdown_content(f.read())
    except OSError:
        title = ""

    return title or get_title_from_filename(filename)


def get_article_sidebar_config_map():
    return {item.path: item for item in ArticleSidebarItem.objects.all()}


def get_configured_title(config_item, default_title):
    if config_item and config_item.title_override:
        return config_item.title_override
    return default_title


def get_configured_sort_order(config_map, path):
    if not config_map:
        return None
    config_item = config_map.get(path)
    return config_item.sort_order if config_item else None


def sort_sidebar_children(children, config_map):
    def sort_key(child):
        configured_order = get_configured_sort_order(config_map, child["path"])
        if configured_order is not None:
            return 0, configured_order, child["natural_order"], child["path"].casefold()
        return 1, child["natural_order"], child["path"].casefold()

    return sorted(children, key=sort_key)


def get_first_article_path(children):
    for child in children:
        if child["node_type"] == "file":
            return child["path"]
        first_article_path = child["tree"].get("first_article_path", "")
        if first_article_path:
            return first_article_path
    return ""


def flatten_directory_tree(tree):
    items = {}
    for child in tree.get("children", []):
        items[child["path"]] = child
        if child["node_type"] == "dir":
            items.update(flatten_directory_tree(child["tree"]))
    return items


def build_directory_tree(root_dir, relative_path="", current_file="", config_map=None):
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
    dirname = os.path.basename(root_dir)
    node_config = config_map.get(relative_path) if config_map and relative_path else None
    tree = {
        'dirname': os.path.basename(root_dir),
        'path': relative_path,
        'node_type': 'dir',
        'default_title': dirname,
        'title': get_configured_title(node_config, dirname),
        'title_override': node_config.title_override if node_config else '',
        'subdirs': {},
        'subdirs_list': [],
        'files': [],
        'children': [],
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

    natural_order = 0

    # 排序文件
    files_sorted = sorted(files, key=parse_sort_key)
    for f in files_sorted:
        file_path = "/".join(part for part in (relative_path, f) if part)
        file_config = config_map.get(file_path) if config_map else None
        default_title = get_title_from_markdown_file(os.path.join(root_dir, f), f)
        file_info = {
            'node_type': 'file',
            'filename': f,
            'path': file_path,
            'parent_path': relative_path,
            'default_title': default_title,
            'title': get_configured_title(file_config, default_title),
            'title_override': file_config.title_override if file_config else '',
            'is_active': file_path == current_file,
            'natural_order': natural_order,
        }
        tree['children'].append(file_info)
        natural_order += 1

    # 递归处理子目录
    for d in dirs:
        subdir_path = os.path.join(root_dir, d)
        subdir_relative_path = "/".join(part for part in (relative_path, d) if part)
        # 这里直接递归构建子目录结构
        subdir_tree = build_directory_tree(subdir_path, subdir_relative_path, current_file, config_map)
        tree['subdirs'][d] = subdir_tree
        subdir_info = {
            'node_type': 'dir',
            'dirname': d,
            'path': subdir_relative_path,
            'parent_path': relative_path,
            'default_title': d,
            'title': subdir_tree['title'],
            'title_override': subdir_tree.get('title_override', ''),
            'tree': subdir_tree,
            'is_open': is_path_under(current_file, subdir_relative_path),
            'article_count': subdir_tree['article_count'],
            'first_article_path': subdir_tree['first_article_path'],
            'natural_order': natural_order,
        }
        tree['children'].append(subdir_info)
        natural_order += 1

    tree['children'] = sort_sidebar_children(tree['children'], config_map)

    for child_index, child in enumerate(tree['children']):
        child['delay_ms'] = 240 + child_index * 80
        if child['node_type'] == 'file':
            tree['files'].append(child)
            tree['article_count'] += 1
        else:
            tree['subdirs_list'].append(child)
            tree['article_count'] += child['article_count']

    tree['first_article_path'] = get_first_article_path(tree['children'])

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


def save_article_sidebar_payload(payload, valid_items):
    if not isinstance(payload, list):
        raise ValueError("提交的数据格式不正确。")

    valid_paths = set(valid_items.keys())
    saved_count = 0

    with transaction.atomic():
        ArticleSidebarItem.objects.exclude(path__in=valid_paths).delete()
        for raw_item in payload:
            if not isinstance(raw_item, dict):
                continue

            path = raw_item.get("path", "")
            if path not in valid_items:
                continue

            valid_item = valid_items[path]
            raw_title = normalize_markdown_title(raw_item.get("title", ""))
            default_title = valid_item.get("default_title", "")
            title_override = raw_title if raw_title and raw_title != default_title else ""

            try:
                sort_order = int(raw_item.get("sort_order", 0))
            except (TypeError, ValueError):
                sort_order = 0

            ArticleSidebarItem.objects.update_or_create(
                path=path,
                defaults={
                    "parent_path": valid_item.get("parent_path", ""),
                    "node_type": valid_item.get("node_type", ArticleSidebarItem.NODE_FILE),
                    "title_override": title_override,
                    "sort_order": max(sort_order, 0),
                },
            )
            saved_count += 1

    return saved_count


@django_view
def index():
    """
    新版主页：遍历文章内容目录，将一级目录作为专栏展示。
    """
    config_map = get_article_sidebar_config_map()
    directory_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR, config_map=config_map)
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
    config_map = get_article_sidebar_config_map()
    directory_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR, current_file=filename, config_map=config_map)
    article_collections = get_article_collections(directory_tree)
    current_collection = get_current_collection(directory_tree, filename)
    sidebar_tree = current_collection['tree'] if current_collection else directory_tree
    sidebar_title = current_collection['title'] if current_collection else '未归入专栏'

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


@staff_member_required
@django_view
def admin_article_sidebar():
    django_request = request._current()

    if django_request.method == "POST":
        if request.POST.get("action") == "reset":
            ArticleSidebarItem.objects.all().delete()
            messages.success(django_request, "已清空侧边栏定制，当前会使用 Markdown 标题和默认目录顺序。")
            return redirect("admin_article_sidebar")

        generated_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR)
        valid_items = flatten_directory_tree(generated_tree)
        raw_payload = request.POST.get("sidebar_payload", "[]")

        try:
            payload = json.loads(raw_payload)
            saved_count = save_article_sidebar_payload(payload, valid_items)
        except (json.JSONDecodeError, ValueError) as exc:
            messages.error(django_request, str(exc))
        else:
            messages.success(django_request, f"已保存 {saved_count} 个侧边栏节点的标题和排序。")

        return redirect("admin_article_sidebar")

    config_map = get_article_sidebar_config_map()
    directory_tree = build_directory_tree(settings.CODEMARK_ARTICLES_DIR, config_map=config_map)
    flat_items = flatten_directory_tree(directory_tree)

    context = admin.site.each_context(django_request)
    context.update({
        "title": "文章侧边栏配置",
        "directory_tree": directory_tree,
        "node_count": len(flat_items),
        "config_count": len(config_map),
        "article_root": settings.CODEMARK_ARTICLES_DIR,
    })
    return render(django_request, "admin/article_sidebar.html", context)
