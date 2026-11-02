from tests.conftest import PASSWORD, bearer


def test_sixth_login_in_a_minute_gets_429(client, make_user, freeze_window):
    make_user(email="a@example.com")
    body = {"email": "a@example.com", "password": PASSWORD}
    statuses = [client.post("/auth/login", json=body).status_code for _ in range(6)]
    assert statuses == [200] * 5 + [429]


def test_429_says_when_to_retry(client, make_user, freeze_window):
    make_user(email="a@example.com")
    body = {"email": "a@example.com", "password": "wrong-password"}
    for _ in range(5):
        client.post("/auth/login", json=body)
    response = client.post("/auth/login", json=body)
    assert response.status_code == 429
    assert 0 < int(response.headers["retry-after"]) <= 60


def test_failed_logins_count_too(client, make_user, freeze_window):
    make_user(email="a@example.com")
    bad = {"email": "a@example.com", "password": "wrong-password"}
    for _ in range(5):
        assert client.post("/auth/login", json=bad).status_code == 401
    good = {"email": "a@example.com", "password": PASSWORD}
    assert client.post("/auth/login", json=good).status_code == 429


def test_one_device_cannot_try_many_accounts(client, freeze_window):
    headers = {"X-Device-Id": "phone-0001"}
    statuses = [
        client.post(
            "/auth/login",
            json={"email": f"user{i}@example.com", "password": "wrong-password"},
            headers=headers,
        ).status_code
        for i in range(6)
    ]
    assert statuses == [401] * 5 + [429]


def test_one_account_limit_does_not_block_another(client, make_user, freeze_window):
    make_user(email="a@example.com")
    make_user(email="b@example.com")
    for _ in range(6):
        client.post("/auth/login", json={"email": "a@example.com", "password": PASSWORD})
    other = client.post("/auth/login", json={"email": "b@example.com", "password": PASSWORD})
    assert other.status_code == 200


def test_writes_are_limited_per_account(client, make_user, freeze_window):
    headers = bearer(make_user())
    statuses = [
        client.patch("/me", json={"display_name": "Name"}, headers=headers).status_code
        for _ in range(31)
    ]
    assert statuses == [200] * 30 + [429]


def test_limit_resets_in_the_next_window(client, make_user, freeze_window):
    make_user(email="a@example.com")
    body = {"email": "a@example.com", "password": PASSWORD}
    for _ in range(6):
        client.post("/auth/login", json=body)
    freeze_window.advance(60)
    assert client.post("/auth/login", json=body).status_code == 200
