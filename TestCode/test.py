import markdown

md = markdown.Markdown(
    extensions=[
        'extra', 'codehilite', 'toc', 'tables', 'fenced_code',
    ]
)
with open('../articles/01-group/01-Variable.md') as f:
    text = f.read()

html = md.convert(text)

with open('01-Variable.html', 'w') as f:
    f.write(html)

