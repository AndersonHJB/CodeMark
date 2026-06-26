from django.conf import settings
from django.db import models


class JudgeProblem(models.Model):
    DIFFICULTY_EASY = "easy"
    DIFFICULTY_MEDIUM = "medium"
    DIFFICULTY_HARD = "hard"
    DIFFICULTY_CHOICES = (
        (DIFFICULTY_EASY, "入门"),
        (DIFFICULTY_MEDIUM, "进阶"),
        (DIFFICULTY_HARD, "挑战"),
    )

    title = models.CharField("标题", max_length=120)
    slug = models.SlugField("URL 标识", max_length=120, unique=True)
    summary = models.CharField("摘要", max_length=240, blank=True)
    difficulty = models.CharField("难度", max_length=16, choices=DIFFICULTY_CHOICES, default=DIFFICULTY_EASY)
    category = models.CharField("分类", max_length=48, blank=True, default="Python")
    statement = models.TextField("题目描述", db_column="description")
    input_description = models.TextField("输入说明", blank=True)
    output_description = models.TextField("输出说明", blank=True)
    constraints = models.TextField("数据范围", blank=True)
    starter_code = models.TextField("初始代码", blank=True)
    time_limit_seconds = models.FloatField("单测超时秒", default=1.5)
    memory_limit_mb = models.PositiveIntegerField("内存限制 MB", default=128)
    is_published = models.BooleanField("发布", default=True, db_index=True)
    sort_order = models.PositiveIntegerField("排序", default=0, db_index=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        db_table = "python_judge_pythonjudgeproblem"
        verbose_name = "Python 判题题目"
        verbose_name_plural = "Python 判题题目"
        ordering = ("sort_order", "id")

    def __str__(self):
        return self.title

    @property
    def tags(self):
        tags = ["Python"]
        if self.category and self.category not in tags:
            tags.insert(0, self.category)
        return tags

    @property
    def time_limit_ms(self):
        return max(300, int((self.time_limit_seconds or 1.5) * 1000))


class JudgeTestCase(models.Model):
    problem = models.ForeignKey(
        JudgeProblem,
        verbose_name="题目",
        related_name="test_cases",
        on_delete=models.CASCADE,
    )
    title = models.CharField("测试点名称", max_length=80, blank=True, db_column="name")
    stdin = models.TextField("输入")
    expected_stdout = models.TextField("期望输出", db_column="expected_output")
    explanation = models.TextField("说明", blank=True)
    is_sample = models.BooleanField("样例", default=False, db_index=True)
    is_active = models.BooleanField("启用", default=True, db_index=True)
    sort_order = models.PositiveIntegerField("排序", default=0, db_index=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        db_table = "python_judge_pythonjudgetestcase"
        verbose_name = "Python 判题测试点"
        verbose_name_plural = "Python 判题测试点"
        ordering = ("sort_order", "id")

    def __str__(self):
        return self.title or f"{self.problem.title} #{self.pk}"

    @property
    def is_hidden(self):
        return not self.is_sample


class UserProblemState(models.Model):
    STATUS_TODO = "todo"
    STATUS_ATTEMPTED = "attempted"
    STATUS_ACCEPTED = "accepted"
    STATUS_CHOICES = (
        (STATUS_TODO, "未开始"),
        (STATUS_ATTEMPTED, "已尝试"),
        (STATUS_ACCEPTED, "已通过"),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="用户", on_delete=models.CASCADE)
    problem = models.ForeignKey(JudgeProblem, verbose_name="题目", on_delete=models.CASCADE)
    status = models.CharField("状态", max_length=20, choices=STATUS_CHOICES, default=STATUS_TODO, db_index=True)
    marked = models.BooleanField("标记", default=False, db_column="is_marked", db_index=True)
    current_code = models.TextField("当前答案", blank=True)
    custom_input = models.TextField("自定义输入", blank=True, db_column="note")
    last_verdict = models.CharField("最近结果", max_length=40, blank=True)
    last_score = models.PositiveSmallIntegerField("最近得分", default=0)
    last_run_at = models.DateTimeField("最近运行", null=True, blank=True)
    last_submitted_at = models.DateTimeField("最近提交", null=True, blank=True)
    run_count = models.PositiveIntegerField("运行次数", default=0)
    submission_count = models.PositiveIntegerField("提交次数", default=0)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        db_table = "python_judge_pythonjudgeprogress"
        verbose_name = "用户 Python 题目状态"
        verbose_name_plural = "用户 Python 题目状态"
        unique_together = ("user", "problem")
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["user", "marked"]),
        ]

    def __str__(self):
        return f"{self.user} / {self.problem} / {self.status}"

    def mark_started(self):
        return None


class JudgeSubmission(models.Model):
    STATUS_ACCEPTED = "accepted"
    STATUS_WRONG_ANSWER = "wrong_answer"
    STATUS_RUNTIME_ERROR = "runtime_error"
    STATUS_CHOICES = (
        (STATUS_ACCEPTED, "通过"),
        (STATUS_WRONG_ANSWER, "答案错误"),
        (STATUS_RUNTIME_ERROR, "运行错误"),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="用户", on_delete=models.CASCADE)
    problem = models.ForeignKey(JudgeProblem, verbose_name="题目", on_delete=models.CASCADE)
    code = models.TextField("提交代码")
    status = models.CharField("结果", max_length=24, choices=STATUS_CHOICES, db_index=True)
    score = models.PositiveSmallIntegerField("得分", default=0)
    passed_count = models.PositiveIntegerField("通过数", default=0)
    total_count = models.PositiveIntegerField("总数", default=0)
    case_results = models.TextField("判题详情", blank=True)
    stdout = models.TextField("标准输出", blank=True)
    stderr = models.TextField("标准错误", blank=True)
    runtime_ms = models.PositiveIntegerField("运行耗时毫秒", default=0, db_column="execution_time_ms")
    created_at = models.DateTimeField("提交时间", auto_now_add=True, db_index=True)

    class Meta:
        db_table = "python_judge_pythonjudgesubmission"
        verbose_name = "Python 判题提交"
        verbose_name_plural = "Python 判题提交"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "problem", "-created_at"]),
            models.Index(fields=["problem", "status"]),
        ]

    def __str__(self):
        return f"{self.user} / {self.problem} / {self.status}"
