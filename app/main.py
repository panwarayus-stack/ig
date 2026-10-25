"""Uvicorn entrypoint: uvicorn app.main:app --host 127.0.0.1 --port 8420"""
from backend.main import app  # noqa: F401  (ASGI target)
