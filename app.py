from flask import Flask, render_template
import markdown
import os, re

app = Flask(__name__)


def sort_articles(articles):
    """ Sort articles by the number at the beginning of the filename """
    return sorted(articles, key=lambda x: int(re.match(r'(\d+)', x).group()))


# @app.route('/')
# def index():
#     # 渲染首页，可以显示博客文章列表
#     articles = os.listdir('articles')
#     return render_template('index.html', articles=articles)
@app.route('/')
def index():
    # Organize articles by directories
    categories = {}
    for root, dirs, files in os.walk('articles'):
        for d in dirs:
            category_path = os.path.join(root, d)
            articles = [f for f in os.listdir(category_path) if f.endswith('.md')]
            categories[d] = sort_articles(articles)
    return render_template('index.html', categories=categories)


# @app.route('/article/<name>')
# def article(name):
#     # 读取并渲染markdown文章
#     with open(f'articles/{name}.md', 'r') as f:
#         content = f.read()
#         html_content = markdown.markdown(content, extensions=['fenced_code', 'codehilite'])
#     return render_template('article.html', content=html_content)
@app.route('/article/<path:filename>')
def article(filename):
    with open(os.path.join('articles', filename), 'r') as f:
        content = f.read()
        html_content = markdown.markdown(content, extensions=['fenced_code', 'codehilite'])
    return render_template('article.html', content=html_content)


if __name__ == '__main__':
    app.run(debug=True)
