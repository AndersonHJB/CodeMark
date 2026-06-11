from django.urls import path

from . import views


urlpatterns = [
    path("algorithms", views.index, name="algorithms"),
    path("algorithms/", views.index),
]
