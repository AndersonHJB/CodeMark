from apps.common.project_payload import DEFAULT_CODE_THEME
from apps.common.responsive import is_mobile_request
from apps.common.runtime import django_view, render_page


@django_view
def editor():
    """
    直接访问 /editor 时，如果没带任何参数，就给它一个空字符串，用于编辑器初始化。
    使用可执行 Python 的模板 editor.html。
    """
    return render_page(
        'editor.html',
        pre_code="",
        pre_lang="python",
        pre_theme=DEFAULT_CODE_THEME,
        pre_project=None,
        share_project_id="",
        is_mobile=is_mobile_request()
    )
