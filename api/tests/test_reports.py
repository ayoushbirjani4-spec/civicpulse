import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, text

from app import config
from app.db import SessionLocal
from app.models import Category, Image, Pin, Report
from tests.conftest import bearer
from tests.test_images import photo


@pytest.fixture
def pothole():
    with SessionLocal() as db:
        return db.scalar(select(Category).where(Category.slug == "pothole"))


def form(category, **over):
    data = {
        "category_id": str(category.id),
        "lat": "27.7052",
        "lng": "68.8574",
        "accuracy_m": "6.5",
        "captured_at": datetime.now(UTC).isoformat(),
        "client_uuid": str(uuid.uuid4()),
        "description": "Deep pothole near the bus stop",
    }
    data.update(over)
    return data


def send(client, user, category, image=None, filename="photo.jpg", **over):
    return client.post(
        "/reports",
        data=form(category, **over),
        files={"photo": (filename, image if image is not None else photo(), "image/jpeg")},
        headers=bearer(user),
    )


def count(model):
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(model))


def test_categories_are_listed_for_users(client, make_user):
    response = client.get("/categories", headers=bearer(make_user()))
    assert response.status_code == 200
    assert [c["slug"] for c in response.json()][:2] == ["pothole", "waterlogged_road"]


def test_categories_need_a_login(client):
    assert client.get("/categories").status_code == 401


def test_report_is_stored_with_point_pin_and_clean_image(client, make_user, pothole):
    response = send(client, make_user(), pothole, image=photo(gps=True), is_mocked="true")
    assert response.status_code == 201
    body = response.json()
    assert body["state"] == "received" and body["is_mocked"] is True and body["pin_id"]
    assert (round(body["lat"], 4), round(body["lng"], 4)) == (27.7052, 68.8574)
    assert body["photo_url"].startswith(config.MEDIA_BASE_URL + "/media/")
    with SessionLocal() as db:
        kind = db.scalar(text("SELECT GeometryType(location::geometry) FROM reports"))
        image = db.scalar(select(Image))
    assert kind == "POINT"
    assert image.uploader_id is not None and image.kind == "report"
    assert os.path.exists(os.path.join(config.MEDIA_DIR, image.storage_name))


def test_same_client_uuid_twice_gives_one_report(client, make_user, pothole):
    user, fixed = make_user(), str(uuid.uuid4())
    first = send(client, user, pothole, client_uuid=fixed)
    again = send(client, user, pothole, client_uuid=fixed)
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["id"] == again.json()["id"]
    assert (count(Report), count(Image), count(Pin)) == (1, 1, 1)


def test_someone_elses_client_uuid_is_refused(client, make_user, pothole):
    fixed = str(uuid.uuid4())
    send(client, make_user(email="a@example.com"), pothole, client_uuid=fixed)
    response = send(client, make_user(email="b@example.com"), pothole, client_uuid=fixed)
    assert response.status_code == 409


def test_unverified_user_gets_403(client, make_user, pothole):
    assert send(client, make_user(verified=False), pothole).status_code == 403


def test_no_token_gets_401(client, pothole):
    response = client.post("/reports", data=form(pothole), files={"photo": ("p.jpg", photo(), "image/jpeg")})
    assert response.status_code == 401


def test_unknown_category_is_refused(client, make_user, pothole):
    response = send(client, make_user(), pothole, category_id=str(uuid.uuid4()))
    assert (response.status_code, response.json()["detail"]) == (422, "unknown_category")


@pytest.mark.parametrize("field,value", [("lat", "91"), ("lng", "-181"), ("accuracy_m", "0"), ("client_uuid", "x")])
def test_bad_position_or_ids_are_refused(client, make_user, pothole, field, value):
    assert send(client, make_user(), pothole, **{field: value}).status_code == 422


def test_capture_time_far_in_the_future_is_refused(client, make_user, pothole):
    later = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    assert send(client, make_user(), pothole, captured_at=later).status_code == 422


def test_script_disguised_as_photo_stores_nothing(client, make_user, pothole):
    response = send(client, make_user(), pothole, image=b"<?php system($_GET['c']); ?>", filename="x.jpg")
    before = set(os.listdir(config.MEDIA_DIR))
    assert response.status_code == 422
    assert (count(Report), count(Image), count(Pin)) == (0, 0, 0)
    assert set(os.listdir(config.MEDIA_DIR)) == before


def test_oversized_photo_is_refused(client, make_user, pothole):
    response = send(client, make_user(), pothole, image=b"\xff" * (6 * 1024 * 1024))
    assert response.status_code == 413


def test_path_in_filename_is_ignored(client, make_user, pothole):
    response = send(client, make_user(), pothole, filename="../../app/main.py")
    assert response.status_code == 201
    with SessionLocal() as db:
        assert ".." not in db.scalar(select(Image.storage_name))


def test_daily_upload_cap(client, make_user, pothole, monkeypatch):
    monkeypatch.setattr("app.routers.reports.DAILY_UPLOAD_CAP", 2)
    user = make_user()
    codes = [send(client, user, pothole).status_code for _ in range(3)]
    assert codes == [201, 201, 429]


def test_my_reports_lists_only_my_own(client, make_user, pothole):
    me, other = make_user(email="me@example.com"), make_user(email="other@example.com")
    send(client, me, pothole)
    send(client, me, pothole)
    send(client, other, pothole)
    body = client.get("/reports/mine", headers=bearer(me)).json()
    assert len(body["items"]) == 2 and body["limit"] == 20


def test_report_detail_is_hidden_from_other_citizens(client, make_user, pothole):
    owner, stranger = make_user(email="o@example.com"), make_user(email="s@example.com")
    admin = make_user(email="admin@example.com", role="admin")
    report_id = send(client, owner, pothole).json()["id"]
    assert client.get(f"/reports/{report_id}", headers=bearer(owner)).status_code == 200
    assert client.get(f"/reports/{report_id}", headers=bearer(stranger)).status_code == 404
    assert client.get(f"/reports/{report_id}", headers=bearer(admin)).status_code == 200


def test_failed_save_leaves_no_orphan_file(client, make_user, pothole, monkeypatch):
    before = set(os.listdir(config.MEDIA_DIR))

    def broken(*args, **kwargs):
        raise RuntimeError("database went away")

    monkeypatch.setattr("app.routers.reports.Pin", broken)
    with pytest.raises(RuntimeError):
        send(client, make_user(), pothole)
    assert set(os.listdir(config.MEDIA_DIR)) == before
