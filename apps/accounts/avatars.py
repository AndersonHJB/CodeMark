import secrets


DEFAULT_AVATAR_STATIC_PATHS = tuple(
    f"images/default-avatars/avatar-{index:02d}.png"
    for index in range(1, 13)
)
DEFAULT_AVATAR_STATIC_PATH = DEFAULT_AVATAR_STATIC_PATHS[0]
DEFAULT_AVATAR_CHOICES = tuple(
    (avatar_path, f"默认头像 {index:02d}")
    for index, avatar_path in enumerate(DEFAULT_AVATAR_STATIC_PATHS, start=1)
)


def random_default_avatar_path():
    return secrets.choice(DEFAULT_AVATAR_STATIC_PATHS)


def normalize_default_avatar_path(avatar_path):
    if avatar_path in DEFAULT_AVATAR_STATIC_PATHS:
        return avatar_path
    return DEFAULT_AVATAR_STATIC_PATH
