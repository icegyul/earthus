# -*- coding: utf-8 -*-
"""Threads 어댑터. social-admin 이 이미 LIVE 로 지원한다(accessToken + userId)."""
from .base import SnsAdapter


class ThreadsAdapter(SnsAdapter):
    platform = "threads"
    formats = ("TEXT", "SINGLE_IMAGE")
    media_required = False
    metrics = ("likes", "comments", "shares")
