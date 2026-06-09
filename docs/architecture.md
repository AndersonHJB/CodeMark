# OK 架构说明

OK 的设计目标是保留原前端交互，同时用 Django 接管路由、Markdown 渲染、分享数据持久化和静态资源服务。

## 请求入口

```text
浏览器
  │
  ├── Django URLConf
  │     ├── codemark/urls.py
  │     └── codemark/views.py
  │
  ├── Jinja2 模板
  │     ├── templates/index.html
  │     ├── templates/article.html
  │     ├── templates/editor.html
  │     └── templates/sharecode.html
  │
  └── 静态资源
        ├── static/css
        ├── static/js
        └── static/vendor
```

## Django 项目结构

| 路径 | 说明 |
| --- | --- |
| `codemark_project/settings.py` | Django 配置、Jinja2 模板配置、静态资源配置 |
| `codemark_project/jinja2.py` | 注入兼容原模板的 `url_for(...)` |
| `codemark/urls.py` | 页面和 API 路由 |
| `codemark/views.py` | 文章、编辑器、分享、下载、资源读取等业务逻辑 |
| `templates/` | 原前端模板 |
| `static/` | 前端依赖资源 |
| `articles/` | Markdown 文章 |
| `sharecode/` | 运行时分享数据 |

## 模板兼容策略

原模板大量使用 Flask 风格：

```jinja2
{{ url_for('static', filename='css/style.css') }}
```

Django 默认模板不支持这种写法，所以项目启用 Jinja2，并在 `codemark_project/jinja2.py` 提供兼容函数。这样模板不需要改写为 `{% static %}`。

## 文章页代码运行

`templates/article.html` 会扫描：

```html
<pre><code class="language-python">...</code></pre>
```

然后把 Python 代码块升级为 CodeMirror 编辑器，并添加“运行代码”按钮。

因此后端 Markdown 渲染必须保留 `language-python` 类。`codemark/views.py` 中的 Markdown 配置禁用了 Pygments 输出，避免代码块被转换成嵌套 span 后失去语言类。

## 分享数据格式

分享数据以文本文件保存，目录按年月分组：

```text
sharecode/
├── 202606/
│   └── <project_id>.txt
├── images/
│   └── <project_id>.png
└── assets/
    └── <project_id>/
```

文本文件中使用内部 marker 保存模板类型、语言、主题、文件、文件夹和资源元数据。这样可以同时兼容单文件代码和多文件项目。

## 关键约束

- 不提交 `sharecode/` 运行时数据。
- 不提交 `.venv/` 和 SQLite 数据库。
- 不引入 Flask 兼容运行时。
- 保持文章页 Python 代码运行能力。
- 保持编辑器和分享页原前端行为。
