# CodeMark 部署教程

本文档适用于当前 Django 版本的 CodeMark 项目部署、更新、备份和排障。按本文步骤配置后，可以完成一套常见的生产部署：

```text
用户浏览器 -> Nginx -> Gunicorn -> Django(CodeMark) -> SQLite / media / logs
```

推荐先按“标准命令行部署”跑通一次；如果使用宝塔面板，再参考“宝塔部署”章节。

## 一次成功部署需要做什么

从空服务器部署到可访问，完整顺序如下：

1. 准备服务器、域名和 Python 3.12+。
2. 拉取或上传 CodeMark 项目代码。
3. 创建虚拟环境并安装依赖。
4. 创建 `.env.prod`，写入生产环境变量。
5. 运行 `scripts/init_deploy.sh .env.prod` 初始化目录、数据库和静态文件。
6. 创建管理员账号。
7. 用 Gunicorn 启动 Django。
8. 用 Nginx 反向代理到 Gunicorn，并配置 `/static/`。
9. 配置 HTTPS。
10. 访问首页、编辑器、分享页和后台确认部署成功。

重要：生产环境不要只创建 `.env.prod` 文件就直接启动项目。当前 `manage.py` 和 `wsgi.py` 默认会使用 `codemark_project.settings`，也就是开发配置入口。生产环境必须在启动进程前把 `.env.prod` 加载到环境变量中，或者通过 systemd `EnvironmentFile`、宝塔自定义启动命令等方式显式加载。

## 项目结构和运行时数据

```text
OK/
├── manage.py
├── codemark_project/
│   └── settings/
│       ├── base.py
│       ├── dev.py
│       └── prod.py
├── apps/
├── content/articles/
├── templates/
├── static/
├── staticfiles/
├── media/sharecode/
├── logs/
├── docs/
├── scripts/init_deploy.sh
├── .env.example
└── requirements.txt
```

关键目录说明：

- `static/`：源码静态资源目录，提交到 Git。
- `staticfiles/`：`python manage.py collectstatic` 输出目录，生产环境由 Nginx 读取。
- `media/sharecode/`：分享代码、二维码、上传资源、图片、音频、视频等运行时数据。
- `logs/`：Django 日志目录。
- `db.sqlite3`：默认 SQLite 数据库，保存管理员账号、登录会话、博客、分享记录等数据。
- `.env.prod`：生产环境变量文件，不要提交到 Git。

部署、更新或重装前必须备份 `db.sqlite3` 和 `media/sharecode/`。这两个位置保存运行时数据，删除后后台账号、分享内容和上传资源都会丢失。

## 环境要求

服务器建议：

- Ubuntu 22.04 / 24.04、Debian 12，或宝塔 Linux 面板。
- Python 3.12、3.13 或 3.14。当前 Django 6.0.x 要求 Python 3.12+。
- Nginx。
- Gunicorn。
- Git，可选；也可以上传压缩包部署。
- 域名，可选；没有域名时可以先用服务器 IP 测试。

如果要使用 C++ 在线编辑器功能，服务器还需要安装 `g++` 或 `clang++`。没有 C++ 编译器时，Python 和分享功能仍可部署，C++ 运行功能会不可用。

## 生产环境变量

生产环境建议在项目根目录创建 `.env.prod`：

```bash
cd /www/wwwroot/codemark-ok
cp .env.example .env.prod
nano .env.prod
```

至少修改这些变量：

```dotenv
DJANGO_SETTINGS_MODULE=codemark_project.settings.prod
DJANGO_SECRET_KEY=替换为生产密钥
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,127.0.0.1,localhost
DJANGO_LOG_LEVEL=INFO
DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE=52428800
```

常用可选变量：

```dotenv
# 默认不设置时使用项目根目录的 db.sqlite3。
# 如果要把数据库放到固定数据目录，可以改成绝对路径。
DJANGO_SQLITE_PATH=/www/wwwroot/codemark-ok/db.sqlite3

# 管理员初始化命令使用。
CODEMARK_ADMIN_USERNAME=admin
CODEMARK_ADMIN_EMAIL=admin@example.com
CODEMARK_ADMIN_PASSWORD=替换为强密码

# C++ 在线编辑器。留空时会从 PATH 查找 g++，再查找 clang++。
CODEMARK_CPP_COMPILER=
CPP_EDITOR_COMPILE_TIMEOUT_SECONDS=12
CPP_EDITOR_RUN_TIMEOUT_SECONDS=3
CPP_EDITOR_INTERACTIVE_RUN_TIMEOUT_SECONDS=60
CPP_EDITOR_MAX_CODE_BYTES=102400
CPP_EDITOR_MAX_STDIN_BYTES=32768
CPP_EDITOR_MAX_OUTPUT_BYTES=65536
```

`DJANGO_ALLOWED_HOSTS` 只写域名或 IP，不要写 `http://`、`https://`，也不要写路径。示例：

```dotenv
DJANGO_ALLOWED_HOSTS=codemark.example.com,127.0.0.1,localhost
```

生成生产密钥：

```bash
source .venv/bin/activate
python - <<'PY'
from django.core.management.utils import get_random_secret_key
print(get_random_secret_key())
PY
```

每次在命令行手动执行生产命令前，都建议先加载 `.env.prod`：

```bash
set -a
source .env.prod
set +a
```

## 标准命令行部署

以下以 Ubuntu/Debian、项目路径 `/www/wwwroot/codemark-ok`、Gunicorn 监听 `127.0.0.1:8991` 为例。实际路径、端口和域名可以按服务器情况调整。

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3-pip nginx git build-essential
```

如果系统源找不到 `python3.12`，请先安装系统支持的 Python 3.12+，或通过宝塔 Python 项目管理器、pyenv、源码编译等方式安装。确认版本：

```bash
python3.12 --version
```

如果需要 C++ 在线运行功能，确认编译器可用：

```bash
g++ --version
```

### 2. 拉取代码

```bash
cd /www/wwwroot
git clone <your-repo-url> codemark-ok
cd /www/wwwroot/codemark-ok
```

如果不用 Git，可以把项目压缩包上传到 `/www/wwwroot/codemark-ok` 并解压。后续命令都在项目根目录执行，也就是包含 `manage.py` 的目录。

### 3. 创建虚拟环境并安装依赖

```bash
cd /www/wwwroot/codemark-ok
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

确认 Django 可以导入：

```bash
python -m django --version
```

### 4. 创建 `.env.prod`

```bash
cp .env.example .env.prod
nano .env.prod
```

最小可用示例：

```dotenv
DJANGO_SETTINGS_MODULE=codemark_project.settings.prod
DJANGO_SECRET_KEY=请替换为随机生产密钥
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,127.0.0.1,localhost
DJANGO_LOG_LEVEL=INFO
DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE=52428800
DJANGO_EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
CODEMARK_ADMIN_USERNAME=admin
CODEMARK_ADMIN_EMAIL=admin@example.com
CODEMARK_ADMIN_PASSWORD=请替换为强密码
```

如果验证码邮件需要真实发送，把邮件后端改成 SMTP，并填写邮箱服务商提供的 SMTP 配置：

```dotenv
DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DJANGO_EMAIL_HOST=smtp.exmail.qq.com
DJANGO_EMAIL_PORT=465
DJANGO_EMAIL_USE_SSL=1
DJANGO_EMAIL_USE_TLS=0
DJANGO_EMAIL_HOST_USER=your-email@example.com
DJANGO_EMAIL_HOST_PASSWORD=your-smtp-password
DJANGO_DEFAULT_FROM_EMAIL="CodeMark <your-email@example.com>"
```

### 5. 初始化数据库、静态文件和检查项

```bash
cd /www/wwwroot/codemark-ok
chmod +x scripts/init_deploy.sh
./scripts/init_deploy.sh .env.prod
```

脚本会自动执行：

- 创建 `logs/`、`media/sharecode/`、`staticfiles/`。
- 激活 `.venv`。
- 加载 `.env.prod`。
- 执行 `python manage.py migrate --noinput`。
- 执行 `python manage.py collectstatic --noinput`。
- 执行 `python manage.py check`。

看到 `Deployment initialization complete` 表示初始化完成。

### 6. 创建管理员账号

```bash
cd /www/wwwroot/codemark-ok
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py create_admin_account
```

如果 `.env.prod` 中配置了 `CODEMARK_ADMIN_USERNAME`、`CODEMARK_ADMIN_EMAIL`、`CODEMARK_ADMIN_PASSWORD`，命令会使用这些值。也可以直接传参：

```bash
python manage.py create_admin_account \
  --username admin \
  --email admin@example.com \
  --password '替换为强密码'
```

重置已有管理员密码：

```bash
python manage.py create_admin_account \
  --username admin \
  --password '新的强密码' \
  --reset-password
```

如果没有传入密码，命令会生成一个随机密码并打印到终端。请立即保存随机密码，命令不会把明文密码写入项目文件。

### 7. 配置运行用户和文件权限

下面以 `www-data` 作为服务运行用户。宝塔通常使用 `www` 用户。

```bash
cd /www/wwwroot/codemark-ok
sudo chown -R www-data:www-data logs media staticfiles
sudo chmod -R 775 logs media staticfiles
```

如果 SQLite 数据库放在项目根目录，运行用户还需要能写 `db.sqlite3` 以及数据库所在目录，因为 SQLite 会在同目录创建临时 journal 文件：

```bash
sudo chown www-data:www-data /www/wwwroot/codemark-ok
sudo chown www-data:www-data /www/wwwroot/codemark-ok/db.sqlite3
```

如果使用自定义数据库路径，例如 `/var/lib/codemark-ok/db.sqlite3`，先创建目录并授权：

```bash
sudo mkdir -p /var/lib/codemark-ok
sudo chown -R www-data:www-data /var/lib/codemark-ok
```

然后在 `.env.prod` 中设置：

```dotenv
DJANGO_SQLITE_PATH=/var/lib/codemark-ok/db.sqlite3
```

修改数据库路径后，需要重新执行：

```bash
./scripts/init_deploy.sh .env.prod
```

### 8. 手动验证 Gunicorn

先用实际服务用户在前台启动一次，确认 Django 进程能正常运行。下面以 `www-data` 为例：

```bash
sudo -u www-data -H bash -lc 'cd /www/wwwroot/codemark-ok && set -a && source .env.prod && set +a && exec .venv/bin/gunicorn codemark_project.wsgi:application --bind 127.0.0.1:8991 --workers 3 --timeout 120'
```

另开一个终端测试：

```bash
curl -I http://127.0.0.1:8991/
curl -I http://127.0.0.1:8991/sharecode
curl -I http://127.0.0.1:8991/admin/
```

返回 `200`、`301` 或 `302` 都说明服务已响应。确认后在 Gunicorn 终端按 `Ctrl+C` 停止，再继续配置 systemd。

### 9. 配置 systemd 服务

创建服务文件：

```bash
sudo nano /etc/systemd/system/codemark-ok.service
```

写入以下内容，按实际路径和用户调整：

```ini
[Unit]
Description=CodeMark OK Django Service
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/www/wwwroot/codemark-ok
EnvironmentFile=/www/wwwroot/codemark-ok/.env.prod
ExecStart=/www/wwwroot/codemark-ok/.venv/bin/gunicorn codemark_project.wsgi:application --bind 127.0.0.1:8991 --workers 3 --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动并设置开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable codemark-ok
sudo systemctl start codemark-ok
sudo systemctl status codemark-ok
```

查看实时日志：

```bash
journalctl -u codemark-ok -f
```

如果修改了 `.env.prod`、代码或依赖，重启服务：

```bash
sudo systemctl restart codemark-ok
```

### 10. 配置 Nginx

创建 Nginx 站点配置：

```bash
sudo nano /etc/nginx/sites-available/codemark-ok
```

写入以下内容，替换域名和路径：

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    client_max_body_size 100m;

    location /static/ {
        alias /www/wwwroot/codemark-ok/staticfiles/;
        expires 30d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://127.0.0.1:8991;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }
}
```

不建议直接暴露整个 `/media/` 目录。`media/sharecode/` 中包含用户分享代码和项目数据，项目会通过 `/share/<project_id>`、`/share_asset/<project_id>/<path>` 等路由按需读取展示。

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/codemark-ok /etc/nginx/sites-enabled/codemark-ok
sudo nginx -t
sudo systemctl reload nginx
```

如果系统已有默认站点占用域名，可以删除默认站点软链接：

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 11. 配置 HTTPS

有域名时建议开启 HTTPS。以 Certbot 为例：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

开启 HTTPS 后确认：

- `.env.prod` 的 `DJANGO_ALLOWED_HOSTS` 包含你的域名。
- Nginx 中保留 `proxy_set_header X-Forwarded-Proto $scheme;`。
- 浏览器访问 `https://example.com/` 正常。

### 12. 上线后验证

浏览器访问：

- `/`：首页或博客页面。
- `/editor`：Python 在线编辑器。
- `/cpp-editor`：C++ 在线编辑器，如果项目路由启用且服务器有编译器。
- `/sharecode`：纯代码分享页面。
- `/admin/`：Django Admin。
- `/admin/share-files/`：分享文件后台。

服务器执行：

```bash
cd /www/wwwroot/codemark-ok
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py check
python manage.py migrate --check
python manage.py makemigrations --check --dry-run
```

以上命令没有报错，页面也能访问，表示部署流程完成。

## 宝塔部署

以下以宝塔面板 + Nginx + Python 项目管理器为例。宝塔不同版本的界面名称可能略有差异，但关键点相同：项目进程必须加载 `.env.prod`，Nginx 必须反向代理到 Gunicorn。

### 1. 安装组件

在宝塔软件商店安装：

- Nginx。
- Python 项目管理器。
- Git，可选。

如果要使用 C++ 在线运行功能，进入服务器终端安装编译器：

```bash
sudo apt update
sudo apt install -y build-essential
```

### 2. 创建网站并放置代码

在宝塔「网站」中添加站点：

- 域名：你的域名，例如 `example.com`。
- 根目录：`/www/wwwroot/codemark-ok`。

拉取代码：

```bash
cd /www/wwwroot
git clone <your-repo-url> codemark-ok
cd /www/wwwroot/codemark-ok
```

也可以通过宝塔文件管理器上传压缩包并解压到 `/www/wwwroot/codemark-ok`。

### 3. 创建虚拟环境并安装依赖

```bash
cd /www/wwwroot/codemark-ok
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

如果宝塔提供的 Python 路径不是 `python3.12`，请替换为宝塔实际的 Python 3.12+ 可执行文件路径。

### 4. 配置 `.env.prod`

```bash
cd /www/wwwroot/codemark-ok
cp .env.example .env.prod
```

在宝塔文件管理器中编辑 `.env.prod`，至少确认：

```dotenv
DJANGO_SETTINGS_MODULE=codemark_project.settings.prod
DJANGO_SECRET_KEY=替换为生产密钥
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,127.0.0.1,localhost
DJANGO_LOG_LEVEL=INFO
DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE=52428800
```

### 5. 初始化项目和管理员

```bash
cd /www/wwwroot/codemark-ok
chmod +x scripts/init_deploy.sh
./scripts/init_deploy.sh .env.prod

source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py create_admin_account
```

宝塔通常使用 `www` 用户运行站点，授权命令如下：

```bash
sudo chown -R www:www logs media staticfiles
sudo chmod -R 775 logs media staticfiles
sudo chown www:www /www/wwwroot/codemark-ok
sudo chown www:www /www/wwwroot/codemark-ok/db.sqlite3
```

### 6. 配置 Python 项目管理器

添加 Python 项目时可按以下方式填写：

- 项目名称：`codemark-ok`
- 项目路径：`/www/wwwroot/codemark-ok`
- Python 版本：Python 3.12+。
- 启动方式：Gunicorn。
- 启动模块：`codemark_project.wsgi:application`
- 监听地址：`127.0.0.1`
- 端口：`8991`
- 运行用户：`www`

关键点：Python 项目管理器必须加载 `.env.prod`。如果面板有“环境变量”输入框，逐项添加 `.env.prod` 中的变量，尤其是：

```text
DJANGO_SETTINGS_MODULE=codemark_project.settings.prod
DJANGO_SECRET_KEY=...
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=...
```

如果面板支持自定义启动命令，推荐使用：

```bash
bash -lc 'cd /www/wwwroot/codemark-ok && set -a && source .env.prod && set +a && .venv/bin/gunicorn codemark_project.wsgi:application --bind 127.0.0.1:8991 --workers 3 --timeout 120'
```

如果没有环境变量输入框，也不支持自定义启动命令，请不要直接用默认启动项上线。默认启动项很可能不会读取 `.env.prod`，导致项目用开发配置启动。

### 7. 配置宝塔 Nginx

在站点设置中添加反向代理：

- 目标 URL：`http://127.0.0.1:8991`
- 发送域名：`$host`

在站点 Nginx 配置中确认包含：

```nginx
client_max_body_size 100m;

location /static/ {
    alias /www/wwwroot/codemark-ok/staticfiles/;
    expires 30d;
    add_header Cache-Control "public";
}

location / {
    proxy_pass http://127.0.0.1:8991;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
}
```

保存后测试并重载：

```bash
nginx -t
bt reload
```

### 8. 配置宝塔 HTTPS

在站点 SSL 设置中申请证书并开启强制 HTTPS。开启后确认：

- `.env.prod` 的 `DJANGO_ALLOWED_HOSTS` 包含域名。
- 反向代理仍指向 `http://127.0.0.1:8991`。
- 浏览器访问 `https://你的域名/` 正常。

## 数据库、迁移和管理员账号

当前项目默认使用 SQLite。数据库配置位于 `codemark_project/settings/base.py`：

```python
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.getenv("DJANGO_SQLITE_PATH", BASE_DIR / "db.sqlite3"),
    }
}
```

未设置 `DJANGO_SQLITE_PATH` 时，数据库文件会创建在项目根目录的 `db.sqlite3`。如果生产环境希望把数据库放到固定数据目录，可以在 `.env.prod` 中设置绝对路径：

```dotenv
DJANGO_SQLITE_PATH=/var/lib/codemark-ok/db.sqlite3
```

SQLite 不需要手动执行 `CREATE DATABASE`。第一次执行迁移时，Django 会自动创建数据库文件和所需数据表。要注意：数据库文件所在目录必须存在，并且运行用户必须有写权限。

### 本地创建数据库

```bash
cd /path/to/OK
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
```

验证迁移状态：

```bash
python manage.py showmigrations
python manage.py migrate --check
```

### 生产创建数据库

```bash
cd /www/wwwroot/codemark-ok
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py migrate --noinput
```

如果使用初始化脚本，脚本已经包含迁移步骤：

```bash
./scripts/init_deploy.sh .env.prod
```

### 创建和应用迁移

修改 `models.py` 后，先生成迁移文件：

```bash
python manage.py makemigrations
```

也可以只为指定应用生成迁移，并给迁移命名：

```bash
python manage.py makemigrations sharing --name add_share_file_status
```

应用迁移：

```bash
python manage.py migrate
```

上线前检查迁移计划和是否遗漏迁移文件：

```bash
python manage.py migrate --plan
python manage.py makemigrations --check --dry-run
```

生产环境执行迁移建议使用：

```bash
python manage.py migrate --noinput
```

如需回退某个应用到指定迁移版本：

```bash
python manage.py migrate sharing 0001
```

回退迁移可能删除字段或数据，生产环境执行前必须备份数据库。

### 管理员账号命令

项目提供 `create_admin_account` 命令，用于创建或更新 Django 超级管理员账号。

使用环境变量创建账号：

```bash
CODEMARK_ADMIN_USERNAME=admin
CODEMARK_ADMIN_EMAIL=admin@example.com
CODEMARK_ADMIN_PASSWORD='替换为强密码'
python manage.py create_admin_account
```

通过命令参数创建账号：

```bash
python manage.py create_admin_account \
  --username admin \
  --email admin@example.com \
  --password '替换为强密码'
```

重置已有管理员密码：

```bash
python manage.py create_admin_account \
  --username admin \
  --password '新的强密码' \
  --reset-password
```

只确认管理员账号存在，不修改已有密码：

```bash
python manage.py create_admin_account --username admin
```

查看命令帮助：

```bash
python manage.py help create_admin_account
```

后台入口：

- `/admin/`：Django Admin 首页。
- `/admin/share-files/`：分享文件后台列表。
- `/admin/share-files/<project_id>/`：分享文件详情。

## 更新流程

更新前先备份运行时数据：

```bash
cd /www/wwwroot/codemark-ok
tar -czf media-sharecode-$(date +%Y%m%d%H%M%S).tar.gz media/sharecode
cp db.sqlite3 db.sqlite3.$(date +%Y%m%d%H%M%S).bak
```

如果使用自定义数据库路径：

```bash
set -a
source .env.prod
set +a
cp "$DJANGO_SQLITE_PATH" "$DJANGO_SQLITE_PATH.$(date +%Y%m%d%H%M%S).bak"
```

更新代码并重新初始化：

```bash
cd /www/wwwroot/codemark-ok
git pull
source .venv/bin/activate
pip install -r requirements.txt
./scripts/init_deploy.sh .env.prod
sudo systemctl restart codemark-ok
```

宝塔部署则在 Python 项目管理器中重启项目。

更新后建议执行：

```bash
set -a
source .env.prod
set +a
python manage.py check
python manage.py migrate --check
python manage.py makemigrations --check --dry-run
```

然后访问：

- `/`
- `/editor`
- `/sharecode`
- `/admin/`
- `/admin/share-files/`

## 备份和恢复

### 备份 SQLite 数据库

默认数据库路径：

```bash
cd /www/wwwroot/codemark-ok
cp db.sqlite3 db.sqlite3.$(date +%Y%m%d%H%M%S).bak
```

自定义数据库路径：

```bash
set -a
source .env.prod
set +a
cp "$DJANGO_SQLITE_PATH" "$DJANGO_SQLITE_PATH.$(date +%Y%m%d%H%M%S).bak"
```

### 备份分享资源

```bash
cd /www/wwwroot/codemark-ok
tar -czf media-sharecode-$(date +%Y%m%d%H%M%S).tar.gz media/sharecode
```

### 恢复数据库

先停止服务：

```bash
sudo systemctl stop codemark-ok
```

恢复备份：

```bash
cd /www/wwwroot/codemark-ok
cp db.sqlite3.备份时间.bak db.sqlite3
sudo chown www-data:www-data db.sqlite3
```

启动服务：

```bash
sudo systemctl start codemark-ok
```

宝塔环境把 `www-data:www-data` 换成 `www:www`，并在 Python 项目管理器中重启项目。

## 常见问题

### 启动时报 `DJANGO_SECRET_KEY must be set in production`

说明生产配置已生效，但 `.env.prod` 中没有设置有效的 `DJANGO_SECRET_KEY`。生成密钥后写入：

```dotenv
DJANGO_SECRET_KEY=生成出来的随机密钥
```

然后重启服务：

```bash
sudo systemctl restart codemark-ok
```

### 项目明明有 `.env.prod`，但还是像开发环境

原因通常是启动进程没有加载 `.env.prod`。确认 systemd 服务有：

```ini
EnvironmentFile=/www/wwwroot/codemark-ok/.env.prod
```

或者 Gunicorn 启动命令前有：

```bash
set -a
source .env.prod
set +a
```

宝塔环境需要在项目管理器里添加环境变量，或使用自定义启动命令加载 `.env.prod`。

### 访问提示 DisallowedHost

检查 `.env.prod`：

```dotenv
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,127.0.0.1,localhost
```

不要写协议、端口和路径。修改后重启 Gunicorn 或 Python 项目。

### 页面能打开但 CSS/JS 丢失

重新收集静态文件：

```bash
cd /www/wwwroot/codemark-ok
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py collectstatic --noinput
```

确认 Nginx 配置：

```nginx
location /static/ {
    alias /www/wwwroot/codemark-ok/staticfiles/;
}
```

然后重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Nginx 显示 502 Bad Gateway

先检查 Gunicorn 是否运行：

```bash
sudo systemctl status codemark-ok
journalctl -u codemark-ok -n 100 --no-pager
```

再确认 Nginx `proxy_pass` 端口和 Gunicorn `--bind` 端口一致：

```nginx
proxy_pass http://127.0.0.1:8991;
```

如果 Gunicorn 没启动，先手动运行第 8 步的 Gunicorn 命令，看终端报错。

### `/admin/` 无法登录或提示数据库表不存在

执行迁移：

```bash
cd /www/wwwroot/codemark-ok
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py migrate --noinput
```

然后确认管理员账号存在：

```bash
python manage.py create_admin_account --username admin
```

### 登录后台后看不到分享文件入口

确认代码已更新，并执行过迁移：

```bash
python manage.py migrate --noinput
sudo systemctl restart codemark-ok
```

登录 `/admin/` 后应看到分享文件后台入口，也可以直接访问 `/admin/share-files/`。

### 分享链接 404

检查运行时数据是否存在：

```bash
ls -lah media/sharecode
```

旧版本迁移时，如果分享数据曾经保存在项目根目录 `sharecode/`，需要迁移到：

```text
media/sharecode/
```

### 图片、视频或音频上传失败

检查 Django 上传限制：

```dotenv
DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE=104857600
```

检查 Nginx 上传限制：

```nginx
client_max_body_size 100m;
```

修改后重启服务或重载 Nginx。

### 后台资源文件不能预览

确认资源 URL 能访问：

```text
/share_asset/<project_id>/<asset_path>
```

图片、视频、音频预览依赖浏览器原生能力。若某些编码格式浏览器不支持，后台仍会保留“新窗口打开”链接。

### 日志、分享文件或数据库写入失败

检查权限：

```bash
cd /www/wwwroot/codemark-ok
sudo chown -R www-data:www-data logs media staticfiles
sudo chmod -R 775 logs media staticfiles
sudo chown www-data:www-data /www/wwwroot/codemark-ok
sudo chown www-data:www-data db.sqlite3
```

宝塔环境通常使用：

```bash
sudo chown -R www:www logs media staticfiles
sudo chmod -R 775 logs media staticfiles
sudo chown www:www /www/wwwroot/codemark-ok
sudo chown www:www db.sqlite3
```

### 验证码邮件没有发送

如果使用控制台邮件后端，邮件只会打印在服务端日志里，不会真实发送：

```dotenv
DJANGO_EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

需要真实发送时改成 SMTP，并填写邮箱服务器、端口、账号、授权码和默认发件人。修改后重启服务。

### C++ 在线运行不可用

确认服务器安装了编译器：

```bash
g++ --version
clang++ --version
```

如果编译器不在 PATH 中，在 `.env.prod` 设置绝对路径：

```dotenv
CODEMARK_CPP_COMPILER=/usr/bin/g++
```

修改后重启服务。

## 部署完成检查清单

部署完成前逐项确认：

- `.env.prod` 存在，并且 `DJANGO_SETTINGS_MODULE=codemark_project.settings.prod`。
- `DJANGO_SECRET_KEY` 已替换为随机生产密钥。
- `DJANGO_DEBUG=0`。
- `DJANGO_ALLOWED_HOSTS` 包含实际域名或 IP。
- `python manage.py migrate --check` 通过。
- `python manage.py collectstatic --noinput` 已执行。
- `staticfiles/`、`media/`、`logs/`、`db.sqlite3` 权限正确。
- Gunicorn 能监听 `127.0.0.1:8991`。
- Nginx 反向代理到 `127.0.0.1:8991`。
- `/static/` 指向 `staticfiles/`。
- `/admin/` 可以登录。
- `/sharecode` 和分享链接可以正常访问。
- 已备份 `db.sqlite3` 和 `media/sharecode/`。
