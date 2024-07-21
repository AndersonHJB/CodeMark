from flask import Flask, render_template
import markdown
import os, re, yaml

app = Flask(__name__)


def parse_metadata(content):
    """ Parse YAML metadata at the start of the Markdown file """
    pattern = re.compile(r"^---.*?---$", re.DOTALL | re.MULTILINE)
    match = pattern.search(content)
    if match:
        metadata = yaml.safe_load(match.group(0).strip('---'))
        content = content.replace(match.group(0), '').strip()
        return metadata, content
    return {}, content


def sort_articles(articles):
    """ Sort articles by the number at the beginning of the filename """
    return sorted(articles, key=lambda x: int(re.match(r'(\d+)', x).group()))


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


@app.route('/article/<path:filename>')
def article(filename):
    with open(os.path.join('articles', filename), 'r') as f:
        content = f.read()
    metadata, content = parse_metadata(content)
    html_content = markdown.markdown(content, extensions=['fenced_code', 'codehilite'])
    return render_template('article.html', content=html_content, metadata=metadata)


if __name__ == '__main__':
    app.run(debug=True)
