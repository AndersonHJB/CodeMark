from django.urls import path

from . import views


urlpatterns = [
    path("cpp-editor", views.cpp_editor, name="cpp_editor"),
    path("cpp-editor/run", views.run_cpp, name="run_cpp"),
    path("cpp-editor/run/start", views.start_cpp_run, name="start_cpp_run"),
    path("cpp-editor/run/poll", views.poll_cpp_run, name="poll_cpp_run"),
    path("cpp-editor/run/input", views.send_cpp_run_input, name="send_cpp_run_input"),
    path("cpp-editor/run/stop", views.stop_cpp_run, name="stop_cpp_run"),
]
