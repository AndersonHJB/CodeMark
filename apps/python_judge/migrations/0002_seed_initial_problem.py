from django.db import migrations


def seed_initial_problem(apps, schema_editor):
    JudgeProblem = apps.get_model("python_judge", "JudgeProblem")
    JudgeTestCase = apps.get_model("python_judge", "JudgeTestCase")

    problem, created = JudgeProblem.objects.get_or_create(
        slug="two-number-sum",
        defaults={
            "title": "两数之和",
            "summary": "读取两个整数，输出它们的和。",
            "difficulty": "easy",
            "category": "基础输入输出",
            "statement": "给定两个整数 a 和 b，请计算并输出 a + b。你需要从标准输入读取数据，并把结果输出到标准输出。",
            "input_description": "一行，包含两个用空格分隔的整数 a 和 b。",
            "output_description": "输出一个整数，表示 a + b 的结果。",
            "constraints": "-10^9 <= a, b <= 10^9",
            "starter_code": "import sys\n\n\ndef solve():\n    data = sys.stdin.read().strip().split()\n    # TODO: 读取两个整数并输出它们的和\n    print(0)\n\n\nif __name__ == \"__main__\":\n    solve()\n",
            "time_limit_seconds": 2.0,
            "memory_limit_mb": 128,
            "is_published": True,
            "sort_order": 10,
        },
    )
    if not created:
        return

    cases = [
        ("样例 1", "2 3\n", "5\n", "2 + 3 = 5。", True, 10),
        ("隐藏用例：负数", "-4 9\n", "5\n", "", False, 20),
        ("隐藏用例：大整数", "1000000000 1000000000\n", "2000000000\n", "", False, 30),
    ]
    for title, stdin, expected_stdout, explanation, is_sample, sort_order in cases:
        JudgeTestCase.objects.create(
            problem=problem,
            title=title,
            stdin=stdin,
            expected_stdout=expected_stdout,
            explanation=explanation,
            is_sample=is_sample,
            is_active=True,
            sort_order=sort_order,
        )


def unseed_initial_problem(apps, schema_editor):
    JudgeProblem = apps.get_model("python_judge", "JudgeProblem")
    JudgeProblem.objects.filter(slug="two-number-sum").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("python_judge", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_initial_problem, unseed_initial_problem),
    ]
