import secrets


_NICKNAME_MOODS = (
    "晨光",
    "星河",
    "山海",
    "清风",
    "微光",
    "云端",
    "深蓝",
    "竹影",
    "晴空",
    "月白",
)
_NICKNAME_TOPICS = (
    "算法",
    "代码",
    "像素",
    "变量",
    "函数",
    "星图",
    "书页",
    "灵感",
    "矩阵",
    "光标",
)
_NICKNAME_CRAFTS = (
    "记录",
    "探索",
    "编译",
    "调试",
    "构建",
    "推理",
    "创作",
    "复盘",
    "迭代",
    "整理",
)
_NICKNAME_ROLES = (
    "者",
    "师",
    "客",
    "手",
    "官",
    "人",
    "家",
    "员",
    "匠",
    "派",
)

_BIO_VERBS = (
    "喜欢记录",
    "正在打磨",
    "持续整理",
    "热衷探索",
    "习惯复盘",
    "专注构建",
    "认真学习",
    "用心分享",
    "尝试连接",
    "慢慢完善",
)
_BIO_TOPICS = (
    "代码笔记",
    "算法思路",
    "项目经验",
    "学习路线",
    "产品想法",
    "生活灵感",
    "问题清单",
    "阅读收获",
    "工具方法",
    "创作草稿",
)
_BIO_METHODS = (
    "相信清晰表达能",
    "希望长期积累能",
    "用稳定节奏去",
    "在每次实践中",
    "把复杂问题拆成小步来",
    "愿意和同伴一起",
    "保持好奇心去",
    "用简洁方案去",
    "在细节里持续",
    "用耐心和专注去",
)
_BIO_GOALS = (
    "解决真实问题",
    "积累可靠作品",
    "发现新的可能",
    "提升学习效率",
    "沉淀个人方法",
    "分享有用经验",
    "把想法落地",
    "保持持续成长",
    "构建更好的工具",
    "记录每一次进步",
)

_NICKNAME_PREFIXES = tuple(
    f"{mood}{topic}" for mood in _NICKNAME_MOODS for topic in _NICKNAME_TOPICS
)
_NICKNAME_SUFFIXES = tuple(
    f"{craft}{role}" for craft in _NICKNAME_CRAFTS for role in _NICKNAME_ROLES
)
DEFAULT_NICKNAMES = tuple(
    f"{prefix}{suffix}" for prefix in _NICKNAME_PREFIXES for suffix in _NICKNAME_SUFFIXES
)

_BIO_OPENERS = tuple(f"{verb}{topic}" for verb in _BIO_VERBS for topic in _BIO_TOPICS)
_BIO_ENDINGS = tuple(f"{method}{goal}" for method in _BIO_METHODS for goal in _BIO_GOALS)
DEFAULT_BIOS = tuple(f"{opener}，{ending}。" for opener in _BIO_OPENERS for ending in _BIO_ENDINGS)


def random_default_nickname():
    return secrets.choice(DEFAULT_NICKNAMES)


def random_default_bio():
    return secrets.choice(DEFAULT_BIOS)


def random_default_profile():
    return {
        "display_name": random_default_nickname(),
        "bio": random_default_bio(),
    }
