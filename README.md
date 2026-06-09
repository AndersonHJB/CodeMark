# OK

OK 是一个面向编程教学、作业提交、代码演示和轻量项目分享的浏览器端代码工作区。它把 Markdown 文章、可运行 Python 代码块、多文件编辑器、分享链接和二维码放在同一个 Django 应用里，目标是让“打开页面就能写、能跑、能分享”。

这个仓库是 OK 的 Django 后端版本。前端页面模板保持原有交互，不需要改写成 Django 模板语法；后端通过 Jinja2 兼容原页面里的 `url_for(...)`。

## 为什么叫 OK

OK 是一个短、轻、明确的工作区状态：

- `O` 表示一个完整的代码学习闭环：阅读、编辑、运行、分享。
- `K` 表示 Keyboard、Knowledge 和 Code 的实践过程。
- `OK` 表示项目就绪，用户可以马上开始写代码。

页面左上角的 OK 标识也承担工作区入口的含义：它不是装饰 Logo，而是“当前代码项目已经准备好”的信号。

## 核心能力

- **文章即练习**：Markdown 文章页中的 Python fenced code 会自动变成可编辑、可运行的 CodeMirror 代码块。
- **在线 Python**：通过 Pyodide 在浏览器端执行 Python，不要求学生先配置本地解释器。
- **多文件工作区**：`/editor` 提供文件树、文件夹、重命名、删除、上传、下载和运行入口。
- **纯分享模式**：`/sharecode` 适合展示多文件项目，不默认强调运行。
- **分享链接**：`/upload_code` 将当前项目持久化为分享 ID，并生成二维码。
- **项目导出**：`/download_project_zip` 可以把当前多文件项目打包下载。
- **移动端保留核心路径**：移动页面保留编辑、分享、文件管理等关键动作。

## 页面地图

| 路径 | 作用 |
| --- | --- |
| `/` | 首页与文章目录 |
| `/article/<path>` | Markdown 文章阅读页，Python 代码块可运行 |
| `/editor` | 可运行 Python 多文件编辑器 |
| `/sharecode` | 纯代码分享编辑器 |
| `/share/<project_id>` | 分享项目页面 |
| `/share_asset/<project_id>/<path>` | 分享项目资源文件 |
| `/upload_code` | POST，生成分享链接 |
| `/download_project_zip` | POST，导出 zip |

## 技术栈

- Python 3.13
- Django 5
- Jinja2
- Python-Markdown
- Pyodide
- CodeMirror
- Ace Editor
- qrcode / Pillow

## 快速开始

```bash
git clone git@github.com:AndersonHJB/OK-Code.git
cd OK-Code

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python manage.py check
python app.py
```

默认访问：

```text
http://127.0.0.1:8991
```

也可以显式指定端口：

```bash
python manage.py runserver 127.0.0.1:8993
```

## 配置

复制环境变量示例：

```bash
cp .env.example .env
```

常用变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | `codemark-local-development-key` | Django 密钥，生产环境必须替换 |
| `DJANGO_DEBUG` | `1` | `1` 开启调试，`0` 关闭调试 |
| `DJANGO_ALLOWED_HOSTS` | `*` | 逗号分隔的允许访问域名 |

## 目录结构

```text
.
├── app.py                    # 快捷启动入口，默认 runserver 0.0.0.0:8991
├── manage.py                 # Django 管理命令入口
├── codemark/                 # Django app：业务视图与路由
├── codemark_project/         # settings / urls / wsgi / asgi / Jinja2 环境
├── templates/                # 页面模板，保持原前端结构
├── static/                   # CSS、JS、图片、Ace、vscode-icons 等静态资源
├── articles/                 # Markdown 文章内容
├── docs/                     # 设计、部署和运行文档
├── TestCode/                 # 示例与实验材料
├── requirements.txt          # Python 依赖
├── passenger_wsgi.py         # Passenger/WSGI 部署入口
└── sharecode/                # 运行时分享数据，本地生成，不提交 Git
```

## 运行时数据

`sharecode/` 保存用户生成的分享文本、二维码和上传资源。这个目录可能很大，也可能包含用户内容，所以默认在 `.gitignore` 中排除。

备份运行数据时单独同步：

```bash
rsync -av sharecode/ user@server:/path/to/ok/sharecode/
```

## 部署

生产环境建议：

```bash
export DJANGO_DEBUG=0
export DJANGO_SECRET_KEY='your-production-secret'
export DJANGO_ALLOWED_HOSTS='ok.example.com,www.ok.example.com'
```

WSGI 入口：

```text
passenger_wsgi.py
codemark_project/wsgi.py
```

静态资源可以直接由 Web 服务器指向 `static/`，也可以接入 `collectstatic` 后发布到 `staticfiles/`。

## 设计约束

- 不改动核心前端模板交互，后端负责适配。
- 文章页必须保留 Python 代码块运行能力。
- 分享数据和上传资源不进入 Git。
- 默认使用 Jinja2 保留 `url_for(...)` 兼容。
- 不依赖 Flask。

## 验证

```bash
python manage.py check
```

核心路径验证：

```text
GET  /
GET  /editor
GET  /sharecode
GET  /article/专栏1/example.md
POST /upload_code
POST /download_project_zip
```

## 文档

- [架构说明](docs/architecture.md)
- [部署指南](docs/deployment.md)
- [运行时数据](docs/runtime-data.md)
- [Markdown 元数据图标](docs/markdown-metadata-icons.md)

## 许可

本项目使用 GNU General Public License v3.0。详见 [LICENSE](LICENSE)。

## 作者

OK 由 黄家宝 | Bornforthis 创建和维护。
