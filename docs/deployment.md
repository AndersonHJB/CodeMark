# OK 部署指南

本文档描述 OK 的常见部署方式。生产环境建议使用 WSGI/ASGI 服务配合 Nginx、Apache 或 Passenger。

## 环境准备

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py check
```

## 必要环境变量

```bash
export DJANGO_DEBUG=0
export DJANGO_SECRET_KEY='replace-with-a-secure-secret'
export DJANGO_ALLOWED_HOSTS='ok.example.com,www.ok.example.com'
```

变量说明：

| 变量 | 说明 |
| --- | --- |
| `DJANGO_DEBUG` | 生产环境应设为 `0` |
| `DJANGO_SECRET_KEY` | 生产环境必须使用安全随机值 |
| `DJANGO_ALLOWED_HOSTS` | 允许访问的域名，多个域名用逗号分隔 |

## WSGI 入口

项目提供两个 WSGI 入口：

```text
passenger_wsgi.py
codemark_project/wsgi.py
```

Passenger 环境可直接指向 `passenger_wsgi.py`。

## 静态资源

开发环境下 Django 可以直接服务 `static/`。生产环境建议让 Web 服务器直接服务静态资源：

```text
/static/ -> /path/to/OK-Code/static/
```

如果你改成 `collectstatic` 流程，可以输出到 `staticfiles/`：

```bash
python manage.py collectstatic
```

当前 `.gitignore` 已排除 `staticfiles/`。

## 运行时数据目录

确保运行用户对 `sharecode/` 有读写权限：

```bash
mkdir -p sharecode
chmod -R u+rwX sharecode
```

该目录保存分享文本、二维码和上传资源，不建议放进 Git。

## 健康检查

部署后至少检查：

```text
GET /
GET /editor
GET /sharecode
GET /article/专栏1/example.md
POST /upload_code
POST /download_project_zip
```

文章页要确认 Python 代码块出现“运行代码”按钮。
