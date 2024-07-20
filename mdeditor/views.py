from django.shortcuts import render

# Create your views here.
from django.shortcuts import render
from .models import MarkdownDocument
from rest_framework import viewsets
from .serializers import MarkdownDocumentSerializer


class MarkdownDocumentViewSet(viewsets.ModelViewSet):
    queryset = MarkdownDocument.objects.all()
    serializer_class = MarkdownDocumentSerializer
