import re

from django import forms
from PIL import Image, UnidentifiedImageError

from .models import BlogPost, BlogTag
from .sanitizer import sanitize_rich_text


MAX_BLOG_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def validate_blog_image(uploaded_file):
    if not uploaded_file:
        return
    content_type = getattr(uploaded_file, "content_type", "")
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise forms.ValidationError("图片仅支持 JPG、PNG、WebP 或 GIF")
    if uploaded_file.size > MAX_BLOG_IMAGE_BYTES:
        raise forms.ValidationError("图片大小不能超过 8MB")
    try:
        with Image.open(uploaded_file) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise forms.ValidationError("图片文件无法识别，请重新选择")
    uploaded_file.seek(0)


class BlogPostForm(forms.ModelForm):
    tags_text = forms.CharField(
        label="标签",
        required=False,
        max_length=180,
        help_text="多个标签用逗号隔开",
    )

    class Meta:
        model = BlogPost
        fields = [
            "title",
            "summary",
            "category",
            "cover_image",
            "content_format",
            "content",
            "allow_comments",
            "tags_text",
        ]
        widgets = {
            "title": forms.TextInput(attrs={"placeholder": "写一个具体、可搜索的标题"}),
            "summary": forms.Textarea(attrs={"rows": 3, "placeholder": "可选，留空时会自动截取正文"}),
            "category": forms.TextInput(attrs={"placeholder": "例如：Python、Django、学习笔记"}),
            "content": forms.Textarea(attrs={"rows": 18}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields["tags_text"].initial = "，".join(self.instance.tags.values_list("name", flat=True))
        self.fields["allow_comments"].required = False

    def clean_title(self):
        title = (self.cleaned_data.get("title") or "").strip()
        if len(title) < 3:
            raise forms.ValidationError("标题至少需要 3 个字符")
        return title

    def clean_content(self):
        content = (self.cleaned_data.get("content") or "").strip()
        if len(content) < 10:
            raise forms.ValidationError("正文至少需要 10 个字符")
        if self.cleaned_data.get("content_format") == BlogPost.FORMAT_RICH_TEXT:
            return sanitize_rich_text(content)
        return content

    def clean_cover_image(self):
        cover_image = self.cleaned_data.get("cover_image")
        validate_blog_image(cover_image)
        return cover_image

    def clean_tags_text(self):
        value = self.cleaned_data.get("tags_text") or ""
        names = []
        seen = set()
        for raw_name in re.split(r"[,，\n#]+", value):
            name = raw_name.strip()
            if not name:
                continue
            if len(name) > 32:
                raise forms.ValidationError("单个标签不能超过 32 个字符")
            key = name.lower()
            if key not in seen:
                names.append(name)
                seen.add(key)
        if len(names) > 8:
            raise forms.ValidationError("最多添加 8 个标签")
        return names

    def save_tags(self, post):
        tag_objects = []
        for name in self.cleaned_data.get("tags_text", []):
            tag, _ = BlogTag.objects.get_or_create(name=name)
            tag_objects.append(tag)
        post.tags.set(tag_objects)
