import markdown
from markdown.extensions import Extension
from markdown.preprocessors import Preprocessor
import re

class MyExtension(Extension):
    def extendMarkdown(self, md):
        md.preprocessors.register(MyPreprocessor(md), 'my_preprocessor', 175)

class MyPreprocessor(Preprocessor):
    def run(self, lines):
        new_lines = []
        for line in lines:
            new_line = re.sub(r'某个模式', '替换内容', line)
            new_lines.append(new_line)
        return new_lines

# 使用自定义扩展
md = markdown.Markdown(extensions=[
    'extra', 'codehilite', 'toc', 'tables', 'fenced_code',
    MyExtension()
])

# html = md.convert(text)
# print(html)
