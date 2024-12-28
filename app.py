# -*- coding: utf-8 -*-
# @Time    : 2024/11/16 09:07
# @Author  : AI悦创
# @FileName: app.py
# @Software: PyCharm
# @Blog    ：https://bornforthis.cn/
# code is far away from bugs with the god animal protecting
#    I love animals. They taste delicious.
from flask import Flask, render_template
import markdown
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
            'extra',  # 包含tables、fenced_code、footnotes、def_list等一揽子常用扩展
            'admonition',  # 支持 !!! note / warning 等提示块
            'attr_list',  # 允许添加HTML属性，如 {#id .class} 写在 markdown 段落或标题后
            'codehilite',  # 代码高亮
            'def_list',  # 定义列表 (extra也有，留这里兼容一些场景)
            'fenced_code',  # 代码块 (extra也有，留这里兼容一些场景)
            'footnotes',  # 脚注
            'tables',  # 表格 (extra也有，留这里兼容一些场景)
            'abbr',  # 缩略词
            'meta',  # 允许在文档开头书写元信息
            'nl2br',  # 自动将单独的换行符转为 <br>
            'sane_lists',  # 更智能地处理列表
            'smarty',  # 智能引号、破折号等排版优化
            'toc',  # 生成目录
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
                           meta=meta)  # 传给模板
    # 注意：元信息在前端可通过 meta 来获取，比如 meta.title, meta.author 等。

@app.route('/sharecode')
def sharecode():
    return render_template('sharecode.html')

if __name__ == '__main__':
    app.run(debug=True)