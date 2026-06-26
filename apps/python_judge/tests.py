import json

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import JudgeProblem, JudgeSubmission, JudgeTestCase, UserProblemState


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
                "results": [{"title": "样例 1", "passed": True}],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(JudgeSubmission.objects.count(), 1)
        state = UserProblemState.objects.get(user=self.user, problem=self.problem)
        self.assertEqual(state.status, UserProblemState.STATUS_ACCEPTED)
        self.assertEqual(state.current_code, "print(3)")
        self.assertIsNotNone(state.last_submitted_at)
