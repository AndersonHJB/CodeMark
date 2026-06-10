# CodeMark 部署文档

本文档适用于当前 Django 版本的 CodeMark 项目部署、升级和后台维护。

## 项目结构

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
└── requirements.txt
```

## 运行时数据

- `static/`：源码静态资源目录，提交到 Git。
- `staticfiles/`：`collectstatic` 输出目录，生产环境给 Nginx 读取。
- `media/sharecode/`：分享代码、二维码、上传资源、图片、音频、视频等运行时数据。
- `logs/`：Django 日志目录。
- `db.sqlite3`：默认 SQLite 数据库，保存管理员账号、登录会话和 Django Admin 数据。

重要：`media/sharecode/` 和生产数据库是运行时数据，升级、重装、重新部署前必须备份，不要删除。

## 环境要求

- Python 3.12+。
- Nginx。
- Gunicorn。
- 推荐使用 `codemark_project.settings.prod`。
- 推荐使用非 root 用户运行 Web 服务，例如 `www-data`、`www` 或站点专用用户。

当前项目默认使用 SQLite。中小规模教学、分享和个人部署可以直接使用；如果将来并发和账号体系变复杂，再迁移到 PostgreSQL。

## 环境变量

生产环境建议创建项目根目录下的 `.env.prod`，不要提交到 Git。

```bash
DJANGO_SETTINGS_MODULE=codemark_project.settings.prod
DJANGO_SECRET_KEY=替换为生产密钥
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,127.0.0.1,localhost
DJANGO_LOG_LEVEL=INFO
DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE=52428800
```

可选变量：

```bash
DJANGO_SQLITE_PATH=/www/wwwroot/codemark-ok/db.sqlite3
CODEMARK_ADMIN_USERNAME=admin
CODEMARK_ADMIN_EMAIL=admin@example.com
CODEMARK_ADMIN_PASSWORD=替换为强密码
CODEMARK_VENV_DIR=.venv
```

`DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE` 控制表单上传体积上限。项目支持分享图片、音频、视频等资源，生产环境应同时在 Django 和 Nginx 中配置合理大小。

生成 `DJANGO_SECRET_KEY`：

```bash
source .venv/bin/activate
python - <<'PY'
from django.core.management.utils import get_random_secret_key
print(get_random_secret_key())
PY
```

## 命令行部署

以下以 Ubuntu/Debian 和 `/www/wwwroot/codemark-ok` 为例，实际路径按服务器调整。

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3-pip nginx git
```

### 2. 拉取代码

```bash
cd /www/wwwroot
git clone <your-repo-url> codemark-ok
cd /www/wwwroot/codemark-ok
```

如果是上传压缩包，解压后进入项目根目录即可。

### 3. 创建虚拟环境

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

### 4. 创建生产环境变量

```bash
cp .env.example .env.prod
nano .env.prod
```

至少确认：

```bash
DJANGO_SETTINGS_MODULE=codemark_project.settings.prod
DJANGO_SECRET_KEY=替换为生产密钥
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=你的域名,127.0.0.1,localhost
```

### 5. 初始化部署

```bash
cd /www/wwwroot/codemark-ok
chmod +x scripts/init_deploy.sh
./scripts/init_deploy.sh .env.prod
```

脚本会执行：

- 创建 `logs/`、`media/sharecode/`、`staticfiles/`。
- 加载 `.env.prod`。
- 执行 `python manage.py migrate --noinput`。
- 执行 `python manage.py collectstatic --noinput`。
- 执行 `python manage.py check`。

### 6. 创建管理员账号

首次部署必须创建管理员账号，才能登录后台查看分享文件。

```bash
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py create_admin_account --username admin
```

如果 `.env.prod` 中配置了 `CODEMARK_ADMIN_PASSWORD`，命令会使用该密码。未配置时会生成一个随机密码并打印到终端。

重置已有管理员密码：

```bash
python manage.py create_admin_account --username admin --reset-password
```

后台入口：

- `/admin/`：Django Admin 首页，登录后有“分享文件后台”入口。
- `/admin/share-files/`：分享文件后台列表。
- `/admin/share-files/<project_id>/`：分享文件详情，可查看文本文件和渲染图片、视频、音频资源。

### 7. 手动验证 Gunicorn

```bash
source .venv/bin/activate
set -a
source .env.prod
set +a
gunicorn codemark_project.wsgi:application \
  --bind 127.0.0.1:8991 \
  --workers 3 \
  --timeout 120
```

验证页面：

- `http://服务器地址:8991/`
- `http://服务器地址:8991/sharecode`
- `http://服务器地址:8991/admin/`

确认正常后按 `Ctrl+C` 停止，再配置 systemd。

### 8. 配置 systemd

创建服务文件：

```bash
sudo nano /etc/systemd/system/codemark-ok.service
```

写入：

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

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable codemark-ok
sudo systemctl start codemark-ok
sudo systemctl status codemark-ok
```

查看日志：

```bash
journalctl -u codemark-ok -f
```

### 9. 配置 Nginx

创建站点配置：

```bash
sudo nano /etc/nginx/sites-available/codemark-ok
```

写入，替换域名和路径：

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

不建议直接暴露整个 `/media/` 目录，因为 `media/sharecode/` 中包含用户分享代码和项目数据。项目通过 `/share/<project_id>` 和 `/share_asset/<project_id>/<path>` 按需读取展示内容。

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/codemark-ok /etc/nginx/sites-enabled/codemark-ok
sudo nginx -t
sudo systemctl reload nginx
```

### 10. HTTPS

建议使用 Certbot 或面板证书功能开启 HTTPS。开启后确认：

- 域名已写入 `DJANGO_ALLOWED_HOSTS`。
- Nginx 仍然转发 `X-Forwarded-Proto $scheme`。
- 如有需要，可在生产 settings 中再开启 HSTS、SSL redirect 等安全项。

## 宝塔部署

以下以宝塔面板 + Nginx + Python 项目管理器为例。

### 1. 安装组件

在宝塔软件商店安装：

- Nginx。
- Python 项目管理器。
- Git，可选。

### 2. 创建网站

在「网站」中添加站点：

- 域名：你的域名，例如 `example.com`。
- 根目录：`/www/wwwroot/codemark-ok`。

拉取代码：

```bash
cd /www/wwwroot
git clone <your-repo-url> codemark-ok
cd /www/wwwroot/codemark-ok
```

也可以通过面板上传压缩包并解压。

### 3. 创建虚拟环境并安装依赖

```bash
cd /www/wwwroot/codemark-ok
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

### 4. 配置 `.env.prod`

```bash
cp .env.example .env.prod
```

在宝塔文件管理器或终端中编辑：

```bash
DJANGO_SETTINGS_MODULE=codemark_project.settings.prod
DJANGO_SECRET_KEY=替换为生产密钥
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,127.0.0.1,localhost
DJANGO_LOG_LEVEL=INFO
DJANGO_DATA_UPLOAD_MAX_MEMORY_SIZE=52428800
```

### 5. 初始化项目

```bash
cd /www/wwwroot/codemark-ok
chmod +x scripts/init_deploy.sh
./scripts/init_deploy.sh .env.prod
```

创建管理员账号：

```bash
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py create_admin_account --username admin
```

### 6. Python 项目管理器配置

添加 Python 项目：

- 项目名称：`codemark-ok`
- 项目路径：`/www/wwwroot/codemark-ok`
- Python 版本：选择 Python 3.12+。
- 启动方式：Gunicorn。
- 启动模块：`codemark_project.wsgi:application`
- 端口：`8991`
- 运行用户：建议使用网站用户或 `www`。

如果支持自定义启动命令：

```bash
bash -lc 'cd /www/wwwroot/codemark-ok && set -a && source .env.prod && set +a && .venv/bin/gunicorn codemark_project.wsgi:application --bind 127.0.0.1:8991 --workers 3 --timeout 120'
```

### 7. 宝塔 Nginx 配置

站点反向代理：

- 目标 URL：`http://127.0.0.1:8991`
- 发送域名：`$host`

站点 Nginx 配置中确保包含：

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

保存后执行：

```bash
nginx -t
bt reload
```

### 8. 宝塔 HTTPS

在站点 SSL 设置中申请证书并开启强制 HTTPS。开启后确认 `.env.prod` 的 `DJANGO_ALLOWED_HOSTS` 包含域名。

## 更新流程

更新前备份运行时数据：

```bash
cd /www/wwwroot/codemark-ok
tar -czf media-sharecode-$(date +%Y%m%d%H%M%S).tar.gz media/sharecode
cp db.sqlite3 db.sqlite3.$(date +%Y%m%d%H%M%S).bak
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

每次更新后建议验证：

```bash
set -a
source .env.prod
set +a
python manage.py check
python manage.py makemigrations --check --dry-run
```

再访问：

- `/`
- `/sharecode`
- `/admin/`
- `/admin/share-files/`

## 权限建议

命令行部署：

```bash
sudo chown -R www-data:www-data /www/wwwroot/codemark-ok/logs /www/wwwroot/codemark-ok/media /www/wwwroot/codemark-ok/staticfiles
sudo chmod -R 775 /www/wwwroot/codemark-ok/logs /www/wwwroot/codemark-ok/media /www/wwwroot/codemark-ok/staticfiles
```

如果使用 SQLite，还要确保运行用户能读写数据库文件和项目目录：

```bash
sudo chown www-data:www-data /www/wwwroot/codemark-ok/db.sqlite3
sudo chown www-data:www-data /www/wwwroot/codemark-ok
```

宝塔环境通常把 `www-data:www-data` 换成 `www:www`。

## 常见问题

### 页面能打开但 CSS/JS 丢失

执行：

```bash
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py collectstatic --noinput
```

确认 Nginx：

```nginx
location /static/ {
    alias /www/wwwroot/codemark-ok/staticfiles/;
}
```

### 访问提示 DisallowedHost

检查 `.env.prod`：

```bash
DJANGO_ALLOWED_HOSTS=example.com,www.example.com,127.0.0.1,localhost
```

修改后重启 Gunicorn 或 Python 项目。

### `/admin/` 无法登录或提示数据库表不存在

执行迁移：

```bash
source .venv/bin/activate
set -a
source .env.prod
set +a
python manage.py migrate
```

然后确认管理员账号存在：

```bash
python manage.py create_admin_account --username admin
```

### 登录后台后看不到分享文件入口

确认已经更新到包含 Admin 入口的代码，并执行过迁移：

```bash
python manage.py migrate
sudo systemctl restart codemark-ok
```

登录 `/admin/` 后应看到“分享文件后台”。也可以直接访问 `/admin/share-files/`。

### 分享链接 404

检查运行时数据：

```bash
ls -lah media/sharecode
```

旧版本迁移时，需要把旧的根目录 `sharecode/` 数据迁移到：

```text
media/sharecode/
```

### 图片、视频或音频上传失败

检查 Django 上传限制：

```bash
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

### 日志或分享文件写入失败

检查权限：

```bash
sudo chown -R www-data:www-data logs media staticfiles
sudo chmod -R 775 logs media staticfiles
```

宝塔环境通常使用：

```bash
sudo chown -R www:www logs media staticfiles
```
