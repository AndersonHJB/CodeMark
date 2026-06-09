# OK

OK is a browser-based code workspace for programming education, homework, demos, and lightweight project sharing. It combines Markdown articles, runnable Python code blocks, a multi-file editor, share links, and QR codes in one Django app.

This repository contains the Django backend version. The original frontend templates and interactions are preserved; Django uses Jinja2 to keep the existing `url_for(...)` template calls working.

## Why OK

OK is short and clear: the workspace is ready.

- `O` represents the learning loop: read, edit, run, and share.
- `K` represents Keyboard, Knowledge, and hands-on coding.
- `OK` tells users that they can start immediately.

## Features

- Markdown article pages turn Python fenced code blocks into editable and runnable CodeMirror blocks.
- Browser-side Python execution powered by Pyodide.
- `/editor` provides a runnable multi-file workspace.
- `/sharecode` provides a pure code sharing workspace.
- `/upload_code` stores share payloads and creates share links plus QR codes.
- `/download_project_zip` exports the current project as a zip archive.
- Static assets, project tree, file uploads, previews, themes, and mobile entry points.

## Quick Start

```bash
git clone git@github.com:AndersonHJB/OK-Code.git
cd OK-Code

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python manage.py check
python app.py
```

Default URL:

```text
http://127.0.0.1:8991
```

Run with an explicit port:

```bash
python manage.py runserver 127.0.0.1:8993
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Home and article tree |
| `/article/<path>` | Markdown article reader with runnable Python blocks |
| `/editor` | Runnable Python workspace |
| `/sharecode` | Pure code sharing workspace |
| `/share/<project_id>` | Shared project page |
| `/upload_code` | POST share payload |
| `/download_project_zip` | POST zip export |

## Runtime Data

`sharecode/` stores generated share files, QR codes, and uploaded assets. It may become large and may contain user content, so it is ignored by Git.

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Runtime data](docs/runtime-data.md)
- [Markdown metadata icons](docs/markdown-metadata-icons.md)

## License

OK is licensed under GNU General Public License v3.0. See [LICENSE](LICENSE).
