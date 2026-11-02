"""Module 3: every uploaded photo is treated as data. It is decoded, re-encoded as a fresh
JPEG with no metadata, stored under a name the server chooses, and fingerprinted."""

import hashlib
import io
import uuid
import warnings
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

from app.config import MAX_IMAGE_SIDE, MAX_UPLOAD_BYTES, MEDIA_BASE_URL, MEDIA_DIR

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
# A small file can still decode to a huge bitmap; refuse anything above about 40 megapixels.
Image.MAX_IMAGE_PIXELS = 40_000_000


class ImageRejected(Exception):
    def __init__(self, code: str, status: int = 422):
        super().__init__(code)
        self.code = code
        self.status = status


@dataclass
class CleanImage:
    jpeg: bytes
    width: int
    height: int
    sha256: str
    phash: str


def _difference_hash(im: Image.Image) -> str:
    """64-bit difference hash: survives re-compression and resizing, so a re-sent copy
    of an old photo still matches. Pillow alone is enough; no numpy needed."""
    small = im.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    px = small.load()
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (px[x, y] > px[x + 1, y])
    return f"{bits:016x}"


def clean(data: bytes) -> CleanImage:
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageRejected("image_too_large", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            im = Image.open(io.BytesIO(data))
            if im.format not in ALLOWED_FORMATS:
                raise ImageRejected("unsupported_image_type", 415)
            im.load()
            im = ImageOps.exif_transpose(im)
            if im.mode != "RGB":
                rgba = im.convert("RGBA")
                im = Image.new("RGB", rgba.size, (255, 255, 255))
                im.paste(rgba, mask=rgba.getchannel("A"))
            im.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            # No exif= argument, so nothing from the camera survives into the stored file.
            im.save(out, "JPEG", quality=85, optimize=True)
    except ImageRejected:
        raise
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageRejected("invalid_image") from None
    jpeg = out.getvalue()
    return CleanImage(jpeg, im.width, im.height, hashlib.sha256(jpeg).hexdigest(), _difference_hash(im))


def store(image: CleanImage) -> str:
    """Write the cleaned bytes under a random name and return that name."""
    name = f"{uuid.uuid4().hex}.jpg"
    Path(MEDIA_DIR).mkdir(parents=True, exist_ok=True)
    with open(Path(MEDIA_DIR) / name, "xb") as f:
        f.write(image.jpeg)
    return name


def delete(name: str) -> None:
    (Path(MEDIA_DIR) / name).unlink(missing_ok=True)


def url_for(name: str) -> str:
    return f"{MEDIA_BASE_URL}/media/{name}"
