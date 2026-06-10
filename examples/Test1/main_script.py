import markdown

text = """
# 这是一个标题

这是一个段落。

* 这是一个列表项
* 这是另一个列表项

```python
print("这是一个代码块")
```

| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |

[TOC]
"""

# 启用多个扩展
md = markdown.Markdown(extensions=[
    'extra',          # 包含多种常用扩展
    'codehilite',     # 代码高亮
    'toc',            # 生成目录
    'tables',         # 表格支持
    'fenced_code'     # 围栏代码块支持
])

html = md.convert(text)
print(html)
