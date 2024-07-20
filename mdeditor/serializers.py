from rest_framework import serializers
from .models import MarkdownDocument

class MarkdownDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarkdownDocument
        fields = ['id', 'title', 'content']
