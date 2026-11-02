import uuid

import pytest
from sqlalchemy import select, update

from app.db import SessionLocal
from app.models import Category, Pin
from tests.conftest import bearer
from tests.test_reports import send


@pytest.fixture
def pothole():
    with SessionLocal() as db:
        return db.scalar(select(Category).where(Category.slug == "pothole"))


SUKKUR = "68.80,27.65,68.95,27.75"


def pins(client, user, **params):
    return client.get("/pins", params={"bbox": SUKKUR, **params}, headers=bearer(user))


def test_pins_need_login(client):
    assert client.get("/pins", params={"bbox": SUKKUR}).status_code == 401


def test_report_appears_as_one_pin_with_one_supporter(client, make_user, pothole):
    user = make_user()
    send(client, user, pothole)
    body = pins(client, user).json()
    assert body["type"] == "FeatureCollection" and body["truncated"] is False
    (feature,) = body["features"]
    props = feature["properties"]
    assert (props["supporter_count"], props["status"], props["follows_pin_id"]) == (1, "open", None)
    assert props["thumbnail_url"]


def test_pin_outside_the_view_is_left_out(client, make_user, pothole):
    user = make_user()
    send(client, user, pothole)
    far = client.get("/pins", params={"bbox": "67.0,24.8,67.2,25.0"}, headers=bearer(user))
    assert far.json()["features"] == []


def test_closed_pins_are_hidden_until_asked_for(client, make_user, pothole):
    user = make_user()
    send(client, user, pothole)
    with SessionLocal() as db:
        db.execute(update(Pin).values(status="closed"))
        db.commit()
    assert pins(client, user).json()["features"] == []
    assert len(pins(client, user, status="closed").json()["features"]) == 1


def test_category_filter(client, make_user, pothole):
    user = make_user()
    send(client, user, pothole)
    assert len(pins(client, user, category=str(pothole.id)).json()["features"]) == 1
    assert pins(client, user, category=str(uuid.uuid4())).json()["features"] == []


def test_public_pins_name_no_reporter(client, make_user, pothole):
    user = make_user()
    send(client, user, pothole)
    text = pins(client, user).text
    assert "user_id" not in text and user.email not in text and "Test User" not in text


def test_citizens_see_a_rounded_position_and_admins_the_exact_one(client, make_user, pothole):
    citizen, admin = make_user(email="c@example.com"), make_user(email="a@example.com", role="admin")
    send(client, citizen, pothole, lat="27.705213", lng="68.857417")
    public = pins(client, citizen).json()["features"][0]["geometry"]["coordinates"]
    exact = pins(client, admin).json()["features"][0]["geometry"]["coordinates"]
    assert public == [68.8574, 27.7052]
    assert [round(x, 6) for x in exact] == [68.857417, 27.705213]


def test_bad_bbox_and_status_are_refused(client, make_user):
    user = make_user()
    for bbox in ("1,2,3", "a,b,c,d", "10,10,5,5", "-200,0,10,10", "nan,0,1,1"):
        assert client.get("/pins", params={"bbox": bbox}, headers=bearer(user)).status_code == 422
    assert pins(client, user, status="deleted").status_code == 422


def test_large_result_says_it_was_cut(client, make_user, pothole, monkeypatch):
    monkeypatch.setattr("app.routers.pins.MAX_PINS", 1)
    user = make_user()
    send(client, user, pothole)
    send(client, user, pothole)
    body = pins(client, user).json()
    assert len(body["features"]) == 1 and body["truncated"] is True


def test_pin_detail_has_photos(client, make_user, pothole):
    user = make_user()
    send(client, user, pothole)
    pin_id = pins(client, user).json()["features"][0]["properties"]["id"]
    response = client.get(f"/pins/{pin_id}", headers=bearer(user))
    assert response.status_code == 200
    assert len(response.json()["properties"]["photo_urls"]) == 1


def test_unknown_pin_is_404(client, make_user):
    assert client.get(f"/pins/{uuid.uuid4()}", headers=bearer(make_user())).status_code == 404


def test_pin_that_follows_a_closed_one_links_to_it(client, make_user, pothole):
    user = make_user()
    send(client, user, pothole)
    send(client, user, pothole)
    with SessionLocal() as db:
        old, new = db.scalars(select(Pin).order_by(Pin.first_reported_at)).all()
        old.status = "closed"
        new.follows_pin_id = old.id
        db.commit()
        new_id, old_id = str(new.id), str(old.id)
    detail = client.get(f"/pins/{new_id}", headers=bearer(user)).json()
    assert detail["properties"]["follows_pin_id"] == old_id
