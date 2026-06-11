from apps.common.runtime import django_view, render_page


@django_view
def index():
    return render_page("algorithms.html")
