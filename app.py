from flask import Flask, render_template
import markdown
import os

app = Flask(__name__)


@app.route('/')
def index():
    # 渲染首页，可以显示博客文章列表
    articles = os.listdir('articles')
    return render_template('index.html', articles=articles)


@app.route('/article/<name>')
def article(name):
    # 读取并渲染markdown文章
    with open(f'articles/{name}.md', 'r') as f:
        content = f.read()
        html_content = markdown.markdown(content, extensions=['fenced_code', 'codehilite'])
    return render_template('article.html', content=html_content)


if __name__ == '__main__':
    app.run(debug=True)
