from sqlalchemy import update

from app.db import SessionLocal
from app.models import Pin
from tests.conftest import bearer
from tests.test_pins import pothole  # noqa: F401  (fixture)
from tests.test_reports import send


def impact(client, user):
    response = client.get("/me/impact", headers=bearer(user))
    assert response.status_code == 200
    return response.json()


def test_impact_needs_login(client):
    assert client.get("/me/impact").status_code == 401


def test_new_user_has_no_impact(client, make_user):
    assert impact(client, make_user()) == {
        "reports": 0,
        "hazards": 0,
        "confirmations": 0,
        "in_repair": 0,
        "fixed": 0,
    }


def test_each_report_counts(client, make_user, pothole):  # noqa: F811
    user = make_user()
    send(client, user, pothole)
    send(client, user, pothole)
    assert impact(client, user) == {
        "reports": 2,
        "hazards": 2,
        "confirmations": 0,
        "in_repair": 0,
        "fixed": 0,
    }


def test_other_supporters_count_as_confirmations(client, make_user, pothole):  # noqa: F811
    # Merging reports into one pin arrives with M5; until then the count is set directly.
    user, other = make_user(), make_user(email="other@example.com")
    send(client, user, pothole)
    with SessionLocal() as db:
        db.execute(update(Pin).values(supporter_count=3))
        db.commit()
    assert impact(client, user)["confirmations"] == 2
    assert impact(client, other)["confirmations"] == 0


def test_repair_progress_and_pin_status_on_my_reports(client, make_user, pothole):  # noqa: F811
    user = make_user()
    send(client, user, pothole)
    with SessionLocal() as db:
        db.execute(update(Pin).values(status="pending_repair"))
        db.commit()
    assert impact(client, user)["in_repair"] == 1
    with SessionLocal() as db:
        db.execute(update(Pin).values(status="closed"))
        db.commit()
    assert impact(client, user)["fixed"] == 1
    (item,) = client.get("/reports/mine", headers=bearer(user)).json()["items"]
    assert item["pin_status"] == "closed"
