# 贡献指南

感谢你愿意改进 OK。

## 开发流程

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py check
python app.py
```

## 提交前检查

```bash
python manage.py check
git diff --check
```

重点确认：

- `/editor` 可以打开。
- `/sharecode` 可以打开。
- 文章页 Python 代码块仍有“运行代码”按钮。
- `sharecode/`、`.venv/`、`db.sqlite3` 没有进入暂存区。

## 模板约束

核心页面模板保留原交互。修改后端时要优先适配现有模板，不要轻易删除前端功能。

核心模板包括：

- `templates/editor.html`
- `templates/sharecode.html`
- `templates/article.html`
- `templates/index.html`
- `templates/_project_sidebar.html`
- `templates/_project_sidebar_support.html`

## 许可证

贡献内容默认遵循本项目的 GNU GPL v3.0 许可证。
