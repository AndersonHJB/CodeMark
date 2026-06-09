# OK 运行时数据

OK 的运行时数据主要保存在 `sharecode/`。这个目录不属于源码仓库，默认被 `.gitignore` 排除。

## 目录用途

```text
sharecode/
├── 202606/          # 按年月保存分享文本
├── images/          # 分享二维码
├── assets/          # 分享项目资源文件
└── project_assets/  # 项目资源缓存或扩展数据
```

## 为什么不提交

- 数据会持续增长，可能非常大。
- 里面可能包含用户上传内容。
- 分享 ID 和二维码属于运行环境状态。
- 迁移和备份策略应独立于源码发布。

## 备份

```bash
rsync -av sharecode/ backup-host:/backup/ok/sharecode/
```

## 恢复

```bash
rsync -av backup-host:/backup/ok/sharecode/ sharecode/
```

恢复后确保应用运行用户有读写权限：

```bash
chmod -R u+rwX sharecode
```

## 清理建议

如果项目面向公开用户，建议定期按业务策略清理过期分享：

- 保留最近 N 个月数据。
- 对大文件资源设置大小上限。
- 对上传资源做类型检查。
- 对重要分享做单独备份。
