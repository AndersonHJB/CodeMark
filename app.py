# -*- coding: utf-8 -*-
# @Time    : 2024/11/16 09:07
# @Author  : AI悦创
# @FileName: app.py
# @Software: PyCharm
# @Blog    ：https://bornforthis.cn/
# code is far away from bugs with the god animal protecting
#    I love animals. They taste delicious.

"""
注释的是原本的主页，没有注释的是新版自动生成“目录”的主页代码和详情页链接。
本示例增加了对目录树的递归获取及排序逻辑，并在 article.html 中实现左侧 VuePress 风格的目录（sidebar）。
"""

from flask import Flask, render_template, request
import markdown
from markdown.extensions.toc import TocExtension
import os, re, random

app = Flask(__name__)


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


# @app.route('/')
# def index():
#     # 渲染首页，可以显示博客文章列表
#     articles = os.listdir('articles')
#     return render_template('index.html', articles=articles)
@app.route('/')
def index():
    """
    新版主页：遍历 'articles' 目录，将其按目录分组后，在首页以类别的形式展示
    """
    # 构建整个 articles 文件夹的目录树
    directory_tree = build_directory_tree('articles')
    # 传给模板做展示
    return render_template('index.html', directory_tree=directory_tree)


# @app.route('/article/<name>')
# def article(name):
#     # 读取并渲染markdown文章
#     with open(f'articles/{name}.md', 'r') as f:
#         content = f.read()
#         html_content = markdown.markdown(content, extensions=['fenced_code', 'codehilite'])
#     return render_template('article.html', content=html_content)
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
        md = markdown.Markdown(extensions=['extra', 'codehilite', 'toc', 'tables', 'fenced_code'])
        html_content = md.convert(content)
        toc = md.toc

    # 构建整个 articles 文件夹的目录树（用于左侧侧边栏）
    directory_tree = build_directory_tree('articles')

    return render_template('article.html',
        content=html_content,
        toc=toc,
        directory_tree=directory_tree,
        current_file=filename)  # 传递当前访问的文章相对路径


if __name__ == '__main__':
    app.run(debug=True)
