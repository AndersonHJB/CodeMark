from django.db import models


class SharedFileAdminEntry(models.Model):
    class Meta:
        managed = False
        verbose_name = "分享文件"
        verbose_name_plural = "分享文件后台"
