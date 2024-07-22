# CodeMark🦭

- [简体中文](ZH_README.md)
- [English](README.md)
- [Releases info](Releases.md)

结合“Code”和“Markdown”的特点，用户可以在 Markdown 中编写并执行代码的功能。

减少学生学习编程的压力，虽然还是推荐本地运行，不过前期线上运行是不错的体验～

如果，你热衷于开源或者想要一起加入这个富有意义的项目当中，可以与我联系。

诚招 Web 精通的伙伴～

## 使用场景🎬

1. 教学文档；
2. 作业文档：学生可以直接解答作业题目提交；
3. 各大高校提升编程作业布置与分享；

## ChangeLog📔

- 2024-07-20 15:32:17: 不停的尝试，使用 Django 到使用 Flask 实现;
- 2024-07-20 15:52:49: 试运行版本，可以正常运行 Python 代码了;
- 2024-07-20 19:15:23: 增加文章页面可编辑代码;
- 2024-07-20 23:26:59: 改进文章内页；
- 2024-07-21 13:50:55: 发布最新版 UI 内页 V0.4
- 2024-07-21 22:57:43: 发布最新版 UI 内页实现代码动态显示

## 项目依赖开🖲️

- [Bornforthis](https://bornforthis.cn/)
- [flask](https://flask.palletsprojects.com/en/3.0.x/)
- [pyodide](https://pyodide.org/en/stable/index.html)

## 声明🖨️

本项目全权由 AI悦创维护，如果想要拿去当作毕业设计、课设等。请及时联系与我沟通，严禁商用。

## deploy🧿

```bash
sh /home/huangjiabao/domains/cm.class1v1.com/public_python/CodeMark/cp_opt.sh
```

## 导出依赖⚙️

```bash
pip freeze > requirements.txt
```


## 作者✍️&请我喝咖啡☕️

![img_1.png](static/info/img_1.png)

## Plan🖥️

- [ ] UI
  - [x] 基础代码框；
  - [x] 代码框高度按现有代码来生成；「实现动态适配」；
  - [ ] 代码行数；
  - [ ] 代码运行快捷键：Ctrl/Command + Enter；
  - [ ] 代码高亮；
- [ ] 功能计划
  - [ ] 代码复制；
  - [ ] 文章禁止复制；
  - [ ] 用户可以导出当前编辑的文章；
  - [ ] 用户需要登录，登录之后可以选择点击分享当前页面编辑的代码和运行结果。数据存储到数据库；
  - [ ] 代码字体大小用户可以自行选择；
- [ ] 版本计划
  - [ ] Vuepress 版本
  - [ ] Django 版本
  - [x] Flask 版本「V0.5」

