# CodeMark🦭

CodeMark 结合了 `Code` 与 `Markdown` 的特点，目标是让用户可以在浏览器中更轻量地编写、运行、管理和分享代码。

它尤其适合教学、作业、课堂演示和代码片段分享：学生不需要一开始就配置完整本地环境，也可以先在线运行 Python 代码，观察输出结果，再逐步迁移到本地开发。

如果你热衷于开源，或者想一起加入这个富有意义的项目，可以与我联系。

诚邀 Python、Web!!! 精通的伙伴～

<a target="_blank" href="https://qm.qq.com/cgi-bin/qm/qr?k=O19F8f7kZPO2D6RWNJHuKViLAYf8bE7u&jump_from=webapi&authKey=Km2k2+Ssx7z1X/b314m0wws9692R7MPEIA/zK/U+g4jjytvr2s86qapzCsapE20r"><img border="0" src="https://pub.idqqimg.com/wpa/images/group.png" alt="CodeMark交流群" title="CodeMark交流群"></a>

## 项目定位🎯

CodeMark 不是为了替代专业 IDE，而是为了降低编程学习和代码分享的起步门槛。

- 对学生：减少环境安装带来的挫败感，先把注意力放在代码逻辑和运行结果上。
- 对老师：可以更方便地布置、展示、分享和讲解代码片段。
- 对内容创作者：可以把代码、说明、运行效果和分享链接组织到一个更易传播的页面中。
- 对自学者：可以快速验证想法，保存代码片段，并通过链接继续交流。

## 核心功能✨

- 在线代码编辑：在浏览器中直接编写代码。
- Python 运行：通过 Pyodide 支持浏览器端 Python 运行体验。
- 代码分享：生成可访问的分享链接和二维码。
- 项目文件侧边栏：支持多文件、文件夹、上传、下载、重命名、删除和选择操作。
- 资源预览：支持图片等资源文件的导入与预览。
- 纯分享模式：可以只分享代码项目，不启用运行功能。
- 移动端适配：在移动设备上保留基础编辑、分享和文件管理入口。

## Logo 寓意💡

![CodeMark OK Logo](static/images/logo.png)

CodeMark 侧边栏左上角使用 `OK` 作为轻量级工作区入口标识，表达“项目已就绪，可以开始编写、管理和分享代码”的状态感。

- `O`：代表代码项目、文件集合与学习闭环，寓意用户可以在一个完整的工作区中组织代码。
- `K`：代表 Code、Keyboard 与 Knowledge，强调编写代码、动手实践和知识沉淀。
- `OK`：整体传达“可用、确认、准备就绪”的含义，让用户进入编辑器时能快速理解当前工作区处于可操作状态。

这个 Logo 在页面中不是复杂的品牌主视觉，而是一个清晰的功能入口：点击它，可以展开或折叠项目文件侧边栏，帮助用户管理多个文件、文件夹和代码资源。

## 使用场景🎬

1. 教学文档：老师可以把代码示例和说明结合起来，便于课堂演示。
2. 作业文档：学生可以在线完成代码题目，并通过链接提交或交流。
3. 高校课程：适合用于编程作业布置、代码片段分享和课堂互动。
4. 代码演示：适合快速展示一个 Python 示例、算法片段或实验思路。
5. 学习记录：适合保存多个文件组成的小型代码项目。

## 页面说明🧭

- `/editor`：可运行的 Python 在线编辑器，适合边写边运行。
- `/sharecode`：纯代码分享与多文件项目展示页面，适合不需要运行的代码分享。
- `/share/<project_id>`：分享链接页面，根据分享类型进入运行模式或纯分享模式。
- `/admin/share-files/`：管理员后台分享文件列表，可查看已存在的全部分享数据。

## 项目依赖开🖲️

- [Bornforthis](https://bornforthis.cn/)
- [Django](https://www.djangoproject.com/)
- [Django Templates](https://docs.djangoproject.com/en/stable/topics/templates/)
- [CodeMirror](https://codemirror.net/)
- [CodeMirror CDN](https://cdnjs.com/libraries/codemirror)
- [Pyodide](https://pyodide.org/en/stable/index.html)
- [Ace Builds](https://github.com/ajaxorg/ace-builds)

主要 Python 依赖可查看 `requirements.txt`，其中包含 Django、Markdown、Pillow、qrcode 等运行所需组件。

## 本地运行🚀

需要 Python 3.12+。当前 Django 版本为 6.0.x，官方支持 Python 3.12、3.13、3.14。

建议使用虚拟环境运行项目：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

如果使用 Django 命令运行：

```bash
python manage.py runserver 0.0.0.0:8991
```

数据库与后台初始化：

```bash
python manage.py migrate
python manage.py create_admin_account --username admin
```

当前项目默认使用 SQLite。首次执行 `python manage.py migrate` 时，Django 会自动在项目根目录创建 `db.sqlite3` 并初始化所需数据表。

创建管理员账号时可以直接传入账号信息：

```bash
python manage.py create_admin_account \
  --username admin \
  --email admin@example.com \
  --password '替换为强密码'
```

也可以通过环境变量设置账号信息：

```bash
CODEMARK_ADMIN_USERNAME=admin
CODEMARK_ADMIN_EMAIL=admin@example.com
CODEMARK_ADMIN_PASSWORD='替换为强密码'
python manage.py create_admin_account
```

重置管理员密码：

```bash
python manage.py create_admin_account \
  --username admin \
  --password '新的强密码' \
  --reset-password
```

常用迁移命令：

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py showmigrations
python manage.py makemigrations --check --dry-run
```

## 部署说明🚢

完整部署、宝塔部署、更新和排障流程请查看：

- [CodeMark 部署文档](docs/deployment.md)
- [数据库、迁移和管理员账号教程](docs/deployment.md#数据库迁移和管理员账号教程)

最小生产部署流程：

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
cp .env.example .env.prod
# 编辑 .env.prod，设置 DJANGO_SETTINGS_MODULE、DJANGO_SECRET_KEY、DJANGO_DEBUG、DJANGO_ALLOWED_HOSTS
./scripts/init_deploy.sh .env.prod
set -a
source .env.prod
set +a
python manage.py create_admin_account --username admin
```

生产环境需要通过 Gunicorn 或面板 Python 项目管理器运行，并使用 Nginx 反向代理。`media/sharecode/` 和 `db.sqlite3` 是运行时数据，更新前请备份。

## 维护命令⚙️

导出依赖：

```bash
pip freeze > requirements.txt
```

服务端部署脚本请根据实际服务器路径调整，避免直接复用本地或旧服务器的绝对路径。

## 声明🖨️

本项目全权由 AI悦创维护。如果想要拿去当作毕业设计、课设等，请及时联系与我沟通，严禁商用。

CodeMark is licensed under the GNU General Public License (GPL) Version 3.
See the LICENSE file for more details.

## 作者✍️&请我喝咖啡☕️

![img_1.png](static/info/img_1.png)

## 关于 CodeMark

CodeMark 是由 黄家宝|Bornforthis 创建并维护的开源项目。使用本项目即表示你同意 GNU General Public License (GPL) Version 3 的相关条款。

任何基于 CodeMark 的修改或衍生项目，也应遵循 GNU GPL 的开源协议要求。

## 如何参与贡献

欢迎提交功能改进、问题修复、文档优化和使用反馈。参与贡献即表示你的贡献内容将遵循与原项目相同的开源协议。
