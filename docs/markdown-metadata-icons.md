# CodeMark Markdown 元数据图标说明

CodeMark 的 Markdown 预览支持在文档顶部编写元数据。`icon` 字段使用 Bootstrap Icons 渲染，推荐写内置图标代码，而不是直接写 CSS 类名。

```markdown
title: CodeMark 学习系统开发计划
icon: blog
date: 2026-04-28 22:09:55
author: AI悦创
isOriginal: true

# 正文标题
这里开始写 Markdown 正文。
```

也支持 YAML 风格分隔符：

```markdown
---
title: CodeMark 学习系统开发计划
icon: plan
date: 2026-04-28 22:09:55
author: AI悦创
isOriginal: true
---
```

## 字段说明

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| `title` | `CodeMark 学习系统开发计划` | 文档标题，会展示在预览顶部元数据卡片中。 |
| `icon` | `blog` | 元数据卡片主图标，见下方图标代码表。 |
| `date` | `2026-04-28 22:09:55` | 文档日期。编辑空 `date:` 行时，页面会浮现“填充当前日期”按钮。 |
| `author` | `AI悦创` | 作者名称。 |
| `isOriginal` | `true` | `true` 渲染为“原创”，`false` 渲染为“转载”。 |

## 图标代码

| icon 代码 | Bootstrap Icons 类名 | 含义 |
| --- | --- | --- |
| `article` | `bi-file-earmark-text` | 文章 |
| `blog` | `bi-journal-richtext` | 博客 |
| `book` | `bi-book` | 书籍 |
| `bookmark` | `bi-bookmark-star` | 收藏 |
| `calendar` | `bi-calendar3` | 日期 |
| `checklist` | `bi-card-checklist` | 清单 |
| `code` | `bi-code-slash` | 代码 |
| `course` | `bi-mortarboard` | 课程 |
| `design` | `bi-palette` | 设计 |
| `diagram` | `bi-diagram-3` | 图解 |
| `docs` | `bi-file-earmark-text` | 文档 |
| `folder` | `bi-folder2-open` | 文件夹 |
| `guide` | `bi-compass` | 指南 |
| `idea` | `bi-lightbulb` | 想法 |
| `image` | `bi-camera` | 图片 |
| `info` | `bi-info-circle` | 信息 |
| `link` | `bi-link-45deg` | 链接 |
| `note` | `bi-pencil-square` | 笔记 |
| `plan` | `bi-kanban` | 计划 |
| `project` | `bi-layers` | 项目 |
| `question` | `bi-question-circle` | 问题 |
| `report` | `bi-graph-up-arrow` | 报告 |
| `rocket` | `bi-rocket-takeoff` | 发布 |
| `security` | `bi-shield-check` | 安全 |
| `star` | `bi-stars` | 精选 |
| `tag` | `bi-tag` | 标签 |
| `tags` | `bi-tags` | 多标签 |
| `task` | `bi-check2-circle` | 任务 |
| `terminal` | `bi-terminal` | 终端 |
| `tutorial` | `bi-easel2` | 教程 |
| `warning` | `bi-exclamation-triangle` | 提醒 |

未识别的 `icon` 会回退到 `article`。
