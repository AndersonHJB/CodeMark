from django.db import models


class ArticleSidebarItem(models.Model):
    NODE_FILE = "file"
    NODE_DIR = "dir"
    NODE_TYPE_CHOICES = (
        (NODE_FILE, "文章"),
        (NODE_DIR, "目录"),
    )

    path = models.CharField("路径", max_length=700, unique=True, db_index=True)
    parent_path = models.CharField("父级路径", max_length=700, blank=True, db_index=True)
    node_type = models.CharField("类型", max_length=12, choices=NODE_TYPE_CHOICES)
    title_override = models.CharField("自定义标题", max_length=255, blank=True)
    sort_order = models.PositiveIntegerField("排序", null=True, blank=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        ordering = ("parent_path", "sort_order", "path")
        verbose_name = "文章侧边栏条目"
        verbose_name_plural = "文章侧边栏条目"

    def __str__(self):
        return self.title_override or self.path


class ArticleSidebarAdminEntry(models.Model):
    class Meta:
        managed = False
        verbose_name = "文章侧边栏配置"
        verbose_name_plural = "文章侧边栏配置"
