from django.test import SimpleTestCase
from django.urls import reverse


class AlgorithmsPageTests(SimpleTestCase):
    def test_algorithms_page_renders(self):
        response = self.client.get(reverse("algorithms"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "算法动画实验室")
