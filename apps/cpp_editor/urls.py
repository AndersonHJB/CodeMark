from django.urls import path

from . import views


urlpatterns = [
    path("cpp-editor", views.cpp_editor, name="cpp_editor"),
    path("cpp-editor/run", views.run_cpp, name="run_cpp"),
]
