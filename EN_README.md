# CodeMark🦭

CodeMark combines `Code` and `Markdown` into a lightweight browser-based experience for writing, running, managing, and sharing code.

It is designed for teaching, homework, classroom demos, and code snippet sharing. Students can start with online Python execution before dealing with a full local development environment, while teachers and creators can share runnable examples more easily.

If you are passionate about open source or want to join this meaningful project, feel free to contact me.

Looking for Python and Web experts to join the team～

## Project Purpose🎯

CodeMark is not intended to replace a professional IDE. Its goal is to reduce the initial friction of programming education and code sharing.

- For students: focus on code logic and output before configuring a local environment.
- For teachers: present, assign, explain, and share code examples more efficiently.
- For creators: combine code, explanation, execution results, and share links in one place.
- For self-learners: quickly test ideas, save snippets, and continue discussions through shared links.

## Core Features✨

- Online code editing directly in the browser.
- Python execution powered by Pyodide.
- Share links and QR codes for code snippets or projects.
- Project file sidebar with file, folder, upload, download, rename, delete, and selection workflows.
- Asset preview for imported resources such as images.
- Pure sharing mode for code projects that do not need execution.
- Mobile-friendly entry points for editing, sharing, and file management.

## Logo Meaning💡

![CodeMark OK Logo](static/images/logo.png)

The `OK` mark in the upper-left sidebar is a lightweight workspace entry point. It communicates that the project is ready for writing, managing, and sharing code.

- `O`: represents code projects, file collections, and the learning loop.
- `K`: represents Code, Keyboard, and Knowledge.
- `OK`: communicates readiness, confirmation, and usability.

In the UI, this logo is not a heavy brand visual. It acts as a clear functional entry: clicking it expands or collapses the project file sidebar, helping users manage files, folders, and code resources.

## Use Cases🎬

1. Teaching documents: teachers can combine examples and explanations for classroom demos.
2. Homework documents: students can solve coding tasks online and share links for review.
3. University courses: useful for programming assignments, snippets, and classroom interaction.
4. Code demos: suitable for quick Python examples, algorithms, or experiment ideas.
5. Learning notes: useful for small multi-file code projects.

## Pages🧭

- `/editor`: runnable Python editor for writing and executing code.
- `/sharecode`: pure code sharing and multi-file project display.
- `/share/<project_id>`: shared project page that opens either runnable mode or pure sharing mode.

## Project Dependencies🖲️

- [Bornforthis](https://bornforthis.cn/)
- [Django](https://www.djangoproject.com/)
- [Django Templates](https://docs.djangoproject.com/en/stable/topics/templates/)
- [CodeMirror](https://codemirror.net/)
- [CodeMirror CDN](https://cdnjs.com/libraries/codemirror)
- [Pyodide](https://pyodide.org/en/stable/index.html)
- [Ace Builds](https://github.com/ajaxorg/ace-builds)

Python dependencies are listed in `requirements.txt`, including Django, Markdown, Pillow, qrcode, and other runtime packages.

## Local Setup🚀

Python 3.12+ is required. The current Django version is 6.0.x, which officially supports Python 3.12, 3.13, and 3.14.

Using a virtual environment is recommended:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

You can also run it with Django:

```bash
python manage.py runserver 0.0.0.0:8991
```

## Database and Admin Initialization

The project uses SQLite by default. The first `migrate` run creates `db.sqlite3` in the project root and initializes the required Django tables:

```bash
python manage.py migrate
python manage.py create_admin_account --username admin
```

Create an admin account with explicit values:

```bash
python manage.py create_admin_account \
  --username admin \
  --email admin@example.com \
  --password 'replace-with-a-strong-password'
```

You can also use environment variables:

```bash
CODEMARK_ADMIN_USERNAME=admin
CODEMARK_ADMIN_EMAIL=admin@example.com
CODEMARK_ADMIN_PASSWORD='replace-with-a-strong-password'
python manage.py create_admin_account
```

Reset an existing admin password:

```bash
python manage.py create_admin_account \
  --username admin \
  --password 'new-strong-password' \
  --reset-password
```

Common migration commands:

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py showmigrations
python manage.py makemigrations --check --dry-run
```

The full Chinese deployment guide includes a dedicated database, migration, and admin-account tutorial:

- [CodeMark deployment guide](docs/deployment.md)

## Maintenance Commands⚙️

Export dependencies:

```bash
pip freeze > requirements.txt
```

Deployment scripts should be adjusted for the actual server path. Avoid reusing local or old absolute paths directly.

## Statement🖨️

This project is fully maintained by AI Yuechuang. If you want to use it for graduation projects, course design, or similar purposes, please contact me in advance. Commercial use is strictly prohibited.

CodeMark is licensed under the GNU General Public License (GPL) Version 3.
See the LICENSE file for more details.

## Author✍️& Buy Me a Coffee☕️

![img_1.png](static/info/img_1.png)

## About CodeMark

CodeMark is an open-source project created and maintained by 黄家宝|Bornforthis. By using this project, you agree to the terms and conditions of the GNU General Public License (GPL) Version 3.

Any modifications or derivative works based on CodeMark must also follow the GNU GPL license requirements.

## How to Contribute

Contributions are welcome, including feature improvements, bug fixes, documentation updates, and usage feedback. By contributing, you agree that your contributions will be licensed under the same terms as the original project.
