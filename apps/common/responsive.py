import re

from .runtime import request


def is_mobile(user_agent: str) -> bool:
    """
    判断是否为移动端访问，根据 user-agent 中常见的移动端标识来做简单匹配。
    你可以根据业务需要，添加或修改更多关键词。
    """
    mobile_regex = re.compile(r'Mobile|Android|iPhone|iPad|iPod', re.IGNORECASE)
    return bool(mobile_regex.search(user_agent))


def is_mobile_request() -> bool:
    """根据当前请求头判断是否移动端。"""
    user_agent = request.headers.get('User-Agent', '')
    return is_mobile(user_agent)
