# CodeMark🦭

- [Simplified Chinese](ZH_README.md)
- [English](README.md)

CodeMark combines the features of "Code" and "Markdown," allowing users to write and execute code within Markdown documents.

It aims to reduce the learning pressure for students in programming, although local execution is still recommended. However, online execution provides a good initial experience.

If you are passionate about open source or want to join this meaningful project, feel free to contact me.

Looking for web experts to join the team～

## Use Cases🎬

1. Teaching documents;
2. Homework documents: Students can directly solve and submit homework questions;
3. Enhancing programming assignments and sharing across major universities;

## ChangeLog📔

- 2024-07-20 15:32:17: Continuous trials, from using Django to using Flask;
- 2024-07-20 15:52:49: Trial version running, can now execute Python code;
- 2024-07-20 19:15:23: Added editable code on article pages;
- 2024-07-20 23:26:59: Improved article pages;
- 2024-07-21 13:50:55: Released the latest version of the UI V0.4

## Project Dependencies🖲️

- [pyodide](https://pyodide.org/en/stable/index.html)

## Statement🖨️

This project is fully maintained by AI Yuechuang. If you want to use it for graduation projects, course design, etc., please contact me in time. Commercial use is strictly prohibited.

## Deploy🧿

```bash
sh /home/huangjiabao/domains/cm.class1v1.com/public_python/CodeMark/cp_opt.sh
```

## Export Dependencies⚙️

```bash
pip freeze > requirements.txt
```

## Author✍️& Buy Me a Coffee☕️

![img_1.png](static/info/img_1.png)

## Plan🖥️

- [ ] UI
  - [x] Basic code box
  - [ ] Code box height generated based on existing code;
  - [ ] Line numbers in code;
  - [ ] Code execution shortcut: Ctrl/Command + Enter;
  - [ ] Code highlighting;
- [ ] Feature Plan
  - [ ] Code copy
  - [ ] Article copy prevention
  - [ ] Users can export currently edited articles
  - [ ] Users need to log in, after logging in they can choose to share the currently edited code and execution results. Data stored in the database;