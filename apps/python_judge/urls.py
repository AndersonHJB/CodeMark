from django.urls import path

from . import views


urlpatterns = [
    path("python-judge/", views.workspace, name="python_judge_workspace"),
    path("python-judge/api/progress/", views.save_progress, name="python_judge_save_progress"),
    path("python-judge/api/submit/", views.submit_solution, name="python_judge_submit"),
]
