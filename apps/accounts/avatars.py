import secrets


ORIGINAL_AVATAR_STATIC_PATHS = tuple(
    f"images/default-avatars/avatar-{index:02d}.png"
    for index in range(1, 13)
)
SELECTED_GENERATED_AVATAR_STATIC_PATHS = (
    "images/default-avatars/已生成图像 1 (1).png",
    "images/default-avatars/已生成图像 2 (1).png",
    "images/default-avatars/已生成图像 2.png",
    "images/default-avatars/已生成图像 3.png",
    "images/default-avatars/已生成图像 4.png",
    "images/default-avatars/已生成图像 5.png",
    "images/default-avatars/已生成图像 6.png",
    "images/default-avatars/已生成图像 7.png",
    "images/default-avatars/已生成图像 8.png",
    "images/default-avatars/已生成图像 9.png",
    "images/default-avatars/已生成图像 10.png",
    "images/default-avatars/已生成图像 11.png",
    "images/default-avatars/已生成图像 12.png",
)

DEFAULT_AVATAR_STATIC_PATHS = SELECTED_GENERATED_AVATAR_STATIC_PATHS + ORIGINAL_AVATAR_STATIC_PATHS
DEFAULT_AVATAR_STATIC_PATH = SELECTED_GENERATED_AVATAR_STATIC_PATHS[0]
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
