import json

from django.contrib.auth import get_user_model
from django.template.loader import render_to_string
from django.test import SimpleTestCase, TestCase
from django.urls import resolve, reverse

from . import views
from .models import JudgeProblem, JudgeSubmission, JudgeTestCase, UserProblemState


class PythonJudgeUrlPatternTests(SimpleTestCase):
    def test_workspace_route_keeps_existing_name_and_path(self):
        self.assertEqual(reverse("python_judge_workspace"), "/python-judge/")
        self.assertIs(resolve(reverse("python_judge_workspace")).func, views.workspace)


class SiteTopbarPythonJudgeMenuTests(SimpleTestCase):
    def test_python_judge_nav_renders_as_active_menu_item(self):
        html = render_to_string(
            "_site_topbar.html",
            {
                "active_nav": "python_judge",
                "show_search": False,
                "show_account": False,
                "brand_logo": "images/logo-cm.svg",
            },
        )

        self.assertIn('<a class="site-nav-link is-active" href="/python-judge/">', html)
        self.assertIn("<span>Python 判题</span>", html)
        self.assertNotIn('class="site-nav-group is-active"', html)


class PythonJudgeApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="learner", email="learner@example.com", password="password123")
        self.problem = JudgeProblem.objects.create(
            title="两数之和",
            slug="sum-two",
            statement="读取两个整数，输出它们的和。",
            starter_code="print(0)",
        )
        JudgeTestCase.objects.create(
            problem=self.problem,
            title="样例 1",
            stdin="1 2\n",
            expected_stdout="3\n",
            is_sample=True,
            is_active=True,
        )

    def post_json(self, url_name, payload):
        return self.client.post(
            reverse(url_name),
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_progress_requires_login(self):
        response = self.post_json("python_judge_save_progress", {"problem_slug": self.problem.slug})
        self.assertEqual(response.status_code, 401)
        self.assertFalse(response.json()["ok"])

    def test_save_progress_persists_code_and_mark(self):
        self.client.force_login(self.user)
        response = self.post_json(
            "python_judge_save_progress",
            {
                "problem_slug": self.problem.slug,
                "code": "print(1 + 2)",
                "custom_input": "1 2",
                "marked": True,
                "status": "attempted",
            },
        )

        self.assertEqual(response.status_code, 200)
        state = UserProblemState.objects.get(user=self.user, problem=self.problem)
        self.assertEqual(state.current_code, "print(1 + 2)")
        self.assertEqual(state.custom_input, "1 2")
        self.assertTrue(state.marked)
        self.assertEqual(state.status, UserProblemState.STATUS_ATTEMPTED)
        self.assertIsNotNone(state.created_at)

    def test_submit_solution_creates_submission_and_accepts_state(self):
        self.client.force_login(self.user)
        response = self.post_json(
            "python_judge_submit",
            {
                "problem_slug": self.problem.slug,
                "code": "print(3)",
                "status": "accepted",
                "passed_count": 1,
                "total_count": 1,
                "runtime_ms": 18,
                "results": [{
                    "title": "样例 1",
                    "passed": True,
                    "ok": True,
                    "durationMs": 7,
                    "stdout": "3\n",
                    "expectedStdout": "3\n",
                }],
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(JudgeSubmission.objects.count(), 1)
        self.assertEqual(data["submission"]["code"], "print(3)")
        self.assertEqual(data["submission"]["score"], 100)
        self.assertEqual(data["submission"]["caseResults"][0]["stdout"], "3\n")
        self.assertEqual(data["submissionCount"], 1)
        self.assertEqual(len(data["submissions"]), 1)
        state = UserProblemState.objects.get(user=self.user, problem=self.problem)
        self.assertEqual(state.status, UserProblemState.STATUS_ACCEPTED)
        self.assertEqual(state.current_code, "print(3)")
        self.assertEqual(state.submission_count, 1)
        self.assertIsNotNone(state.last_submitted_at)
