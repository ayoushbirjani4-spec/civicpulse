"""The media origin. A separate app on its own port, so that a file a browser could be
tricked into treating as a page never runs with the dashboard's address and cookies.

    uvicorn app.media:media_app --port 8001
"""

import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

# Reads its folder directly so this process needs no database or token secret.
MEDIA_DIR = os.environ.get("MEDIA_DIR", "/data/media")
media_app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_NAME = re.compile(r"[0-9a-f]{32}\.jpg")
_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Cache-Control": "public, max-age=31536000, immutable",
}


@media_app.get("/media/{name}")
def get_media(name: str):
    # Only names the server generated; anything else, including ../, is simply not found.
    path = Path(MEDIA_DIR) / name
    if not _NAME.fullmatch(name) or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="image/jpeg", headers=_HEADERS)
