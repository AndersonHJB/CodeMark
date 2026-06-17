from django.templatetags.static import static

from .avatars import DEFAULT_AVATAR_STATIC_PATH, normalize_default_avatar_path
from .models import UserProfile


def _profile_for_user(user):
    try:
        return user.codemark_profile
    except UserProfile.DoesNotExist:
        return None


def account_context(request):
    default_avatar_url = static(DEFAULT_AVATAR_STATIC_PATH)
    payload = {
        "is_authenticated": False,
        "display_name": "登录 CodeMark",
        "email": "",
        "username": "",
        "avatar_url": default_avatar_url,
        "default_avatar_url": default_avatar_url,
    }

    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        profile = _profile_for_user(user)
        display_name = (
            (profile.display_name if profile else "")
            or user.get_full_name()
            or user.get_username()
        )
        avatar_url = default_avatar_url
        if profile and profile.avatar:
            avatar_url = profile.avatar.url
        elif profile:
            avatar_url = static(normalize_default_avatar_path(profile.default_avatar))
        payload.update(
            {
                "is_authenticated": True,
                "display_name": display_name,
                "email": user.email,
                "username": user.get_username(),
                "avatar_url": avatar_url,
            }
        )

    return {"codemark_account": payload}
