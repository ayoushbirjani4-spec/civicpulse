import hashlib
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import images
from app.config import MEDIA_BASE_URL
from app.media import media_app


def photo(fmt="JPEG", mode="RGB", size=(800, 600), gps=False, color=(120, 90, 60)):
    im = Image.new(mode, size, color if mode == "RGB" else None)
    buf = io.BytesIO()
    kwargs = {}
    if gps:
        exif = Image.Exif()
        exif[0x0110] = "Pixel 7"
        exif[0x8825] = {1: "N", 2: (27.0, 42.0, 18.0), 3: "E", 4: (68.0, 51.0, 26.0)}
        kwargs["exif"] = exif
    im.save(buf, fmt, **kwargs)
    return buf.getvalue()


def test_gps_and_camera_metadata_are_removed():
    source = photo(gps=True)
    assert Image.open(io.BytesIO(source)).getexif().get_ifd(0x8825)
    stored = Image.open(io.BytesIO(images.clean(source).jpeg))
    assert len(stored.getexif()) == 0


def test_script_renamed_to_jpg_is_rejected():
    with pytest.raises(images.ImageRejected) as e:
        images.clean(b"#!/bin/sh\nrm -rf /\n")
    assert e.value.code == "invalid_image"


def test_six_megabyte_file_is_rejected():
    with pytest.raises(images.ImageRejected) as e:
        images.clean(b"\xff" * (6 * 1024 * 1024))
    assert (e.value.code, e.value.status) == ("image_too_large", 413)


def test_gif_is_not_an_allowed_type():
    with pytest.raises(images.ImageRejected) as e:
        images.clean(photo("GIF", mode="P"))
    assert e.value.status == 415


@pytest.mark.parametrize("fmt,mode", [("PNG", "LA"), ("PNG", "RGBA"), ("JPEG", "CMYK"), ("WEBP", "RGB")])
def test_ordinary_formats_and_modes_are_accepted(fmt, mode):
    cleaned = images.clean(photo(fmt, mode=mode, size=(60, 40)))
    assert Image.open(io.BytesIO(cleaned.jpeg)).format == "JPEG"


def test_long_side_is_limited_to_1600():
    cleaned = images.clean(photo(size=(4000, 3000)))
    assert (cleaned.width, cleaned.height) == (1600, 1200)


def test_hash_is_of_the_stored_bytes_and_survives_recompression():
    original = photo(size=(640, 480), color=(10, 200, 30))
    first = images.clean(original)
    assert first.sha256 == hashlib.sha256(first.jpeg).hexdigest()
    again = images.clean(first.jpeg)
    assert (int(first.phash, 16) ^ int(again.phash, 16)).bit_count() <= 4


def test_stored_name_is_random_and_never_from_the_user():
    name = images.store(images.clean(photo()))
    assert len(name) == 36 and name.endswith(".jpg") and "/" not in name
    images.delete(name)


def test_media_origin_serves_with_nosniff():
    name = images.store(images.clean(photo()))
    response = TestClient(media_app).get(f"/media/{name}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-content-type-options"] == "nosniff"
    images.delete(name)


@pytest.mark.parametrize("name", ["../../etc/passwd", "..%2F..%2Fapp%2Fmain.py", "abc.jpg", "x" * 32 + ".png"])
def test_media_origin_refuses_anything_but_stored_names(name):
    assert TestClient(media_app).get(f"/media/{name}").status_code == 404


def test_media_origin_differs_from_the_api():
    assert not MEDIA_BASE_URL.endswith(":8000")
