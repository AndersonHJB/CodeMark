from django.contrib import admin

from .models import JudgeProblem, JudgeSubmission, JudgeTestCase, UserProblemState


class JudgeTestCaseInline(admin.TabularInline):
    model = JudgeTestCase
    extra = 1
    fields = ("title", "stdin", "expected_stdout", "explanation", "is_sample", "is_active", "sort_order")


@admin.register(JudgeProblem)
class JudgeProblemAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "difficulty", "is_published", "sort_order", "updated_at")
    list_filter = ("difficulty", "category", "is_published", "updated_at")
    list_editable = ("is_published", "sort_order")
    search_fields = ("title", "slug", "summary", "statement")
    prepopulated_fields = {"slug": ("title",)}
    inlines = (JudgeTestCaseInline,)
    readonly_fields = ("created_at", "updated_at")


@admin.register(JudgeTestCase)
class JudgeTestCaseAdmin(admin.ModelAdmin):
    list_display = ("problem", "title", "is_sample", "is_active", "sort_order", "created_at")
    list_filter = ("is_sample", "is_active", "problem")
    search_fields = ("problem__title", "title", "stdin", "expected_stdout")
    autocomplete_fields = ("problem",)


@admin.register(UserProblemState)
class UserProblemStateAdmin(admin.ModelAdmin):
    list_display = ("user", "problem", "status", "marked", "last_submitted_at", "updated_at")
    list_filter = ("status", "marked", "updated_at")
    search_fields = ("user__username", "user__email", "problem__title", "current_code")
    autocomplete_fields = ("user", "problem")
    readonly_fields = ("created_at", "last_submitted_at", "updated_at")


@admin.register(JudgeSubmission)
class JudgeSubmissionAdmin(admin.ModelAdmin):
    list_display = ("user", "problem", "status", "passed_count", "total_count", "runtime_ms", "created_at")
    list_filter = ("status", "problem", "created_at")
    search_fields = ("user__username", "user__email", "problem__title", "code")
    autocomplete_fields = ("user", "problem")
    readonly_fields = ("created_at",)
