"""Paul Fitness Gym backend API tests."""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
).rstrip("/")

MANAGER_EMAIL = "manager@paulfitness.com"
MANAGER_PASSWORD = "Paul@Manager123"

# Direct mongo handle for test-user seeding (Google OAuth can't be simulated)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "paul_fitness")
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

TEST_USER_PREFIX = "TEST_"


# ---------------- Public endpoints ----------------
class TestPublicEndpoints:
    def test_plans_returns_4_seeded(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/plans")
        assert r.status_code == 200, r.text
        plans = r.json()
        assert isinstance(plans, list)
        assert len(plans) == 4
        names = {p["name"] for p in plans}
        assert names == {"Monthly", "Quarterly", "Half-Year", "Annual"}
        # sorted by duration ascending
        durations = [p["duration_months"] for p in plans]
        assert durations == sorted(durations)
        # verify expected price tiers
        price_map = {p["duration_months"]: p["price_inr"] for p in plans}
        assert price_map == {1: 1000, 3: 2500, 6: 4500, 12: 8000}
        # No _id leakage
        for p in plans:
            assert "_id" not in p

    def test_gym_info(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/gym-info")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "PAUL FITNESS GYM"
        assert "Raghunathpur" in body["address"]
        assert body["phone"] == "07908283507"

    def test_payments_config_disabled(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/payments/config")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["razorpay_enabled"] is False


# ---------------- Manager auth ----------------
class TestManagerAuth:
    def test_login_success(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/manager/login",
            json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "session_token" in body and body["session_token"]
        assert body["user"]["role"] == "manager"
        assert body["user"]["email"] == MANAGER_EMAIL
        assert "password_hash" not in body["user"]
        assert "_id" not in body["user"]

    def test_login_wrong_password(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/manager/login",
            json={"email": MANAGER_EMAIL, "password": "WrongPassword123"},
        )
        assert r.status_code == 401

    def test_me_without_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_manager_token(self, api_client, manager_token):
        r = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["role"] == "manager"
        assert "_id" not in body["user"]
        # Manager has no membership
        assert body.get("membership") is None

    def test_logout_invalidates_token(self, api_client):
        # Fresh login so we don't break other tests
        r = api_client.post(
            f"{BASE_URL}/api/auth/manager/login",
            json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD},
        )
        token = r.json()["session_token"]
        r2 = api_client.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 200
        r3 = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r3.status_code == 401


# ---------------- Manager-only routes ----------------
class TestManagerRoutes:
    def test_members_without_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/manager/members")
        assert r.status_code in (401, 403)

    def test_stats_returns_all_keys(self, api_client, manager_token):
        r = api_client.get(
            f"{BASE_URL}/api/manager/stats",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("total", "active", "expiring", "expired"):
            assert k in body
            assert isinstance(body[k], int)

    def test_members_list(self, api_client, manager_token):
        r = api_client.get(
            f"{BASE_URL}/api/manager/members",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list)
        for m in body:
            assert "_id" not in m

    def test_members_query_filter(self, api_client, manager_token):
        r = api_client.get(
            f"{BASE_URL}/api/manager/members",
            headers={"Authorization": f"Bearer {manager_token}"},
            params={"q": "zzz_nomatch_xyz"},
        )
        assert r.status_code == 200
        # this random string should match no one
        assert r.json() == []

    def test_members_status_filter(self, api_client, manager_token):
        r = api_client.get(
            f"{BASE_URL}/api/manager/members",
            headers={"Authorization": f"Bearer {manager_token}"},
            params={"status": "active"},
        )
        assert r.status_code == 200
        body = r.json()
        for m in body:
            assert m["status"] == "active"


# ---------------- Record cash + member detail (requires seeded test user) ----------------
class TestCashFlow:
    def test_record_cash_and_verify(self, api_client, manager_token, test_user):
        # baseline stats
        s0 = api_client.get(
            f"{BASE_URL}/api/manager/stats",
            headers={"Authorization": f"Bearer {manager_token}"},
        ).json()
        baseline_active = s0["active"]

        # record cash for Monthly plan
        r = api_client.post(
            f"{BASE_URL}/api/manager/record-cash",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"user_id": test_user["user_id"], "plan_id": "plan_1m"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        mem = body["membership"]
        assert mem["payment_method"] == "cash"
        assert mem["amount"] == 1000
        assert mem["plan_name"] == "Monthly"
        assert "_id" not in mem

        # GET member detail
        r2 = api_client.get(
            f"{BASE_URL}/api/manager/members/{test_user['user_id']}",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert r2.status_code == 200, r2.text
        detail = r2.json()
        assert detail["user"]["user_id"] == test_user["user_id"]
        assert detail["current"] is not None
        assert detail["current"]["status"] == "active"
        assert len(detail["history"]) >= 1
        for h in detail["history"]:
            assert "_id" not in h
        assert "_id" not in detail["user"]

        # find this user in the listing -> days_remaining > 0
        r3 = api_client.get(
            f"{BASE_URL}/api/manager/members",
            headers={"Authorization": f"Bearer {manager_token}"},
            params={"q": test_user["email"]},
        )
        assert r3.status_code == 200
        listing = r3.json()
        assert len(listing) == 1
        assert listing[0]["days_remaining"] is not None
        assert listing[0]["days_remaining"] > 0

        # stats reflects the new active member
        s1 = api_client.get(
            f"{BASE_URL}/api/manager/stats",
            headers={"Authorization": f"Bearer {manager_token}"},
        ).json()
        assert s1["active"] == baseline_active + 1


# ---------------- Razorpay disabled ----------------
class TestRazorpayDisabled:
    def test_order_fails_when_not_configured(self, api_client, manager_token):
        # Manager token is still a valid bearer; endpoint should hit "not configured"
        # before any role check, since it only requires get_user_by_token (not require_user).
        r = api_client.post(
            f"{BASE_URL}/api/payments/order",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"plan_id": "plan_1m"},
        )
        # 400 = not configured (expected); plan exists so won't be 404
        assert r.status_code == 400, r.text
        assert "not configured" in r.json().get("detail", "").lower()


# ---------------- Idempotency / restart-safety smoke ----------------
class TestIdempotency:
    def test_plans_count_stable(self, api_client):
        # Hit twice; count must remain 4 (seed is idempotent via upsert)
        for _ in range(2):
            r = api_client.get(f"{BASE_URL}/api/plans")
            assert r.status_code == 200
            assert len(r.json()) == 4

    def test_manager_login_still_works(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/manager/login",
            json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD},
        )
        assert r.status_code == 200


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def manager_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/manager/login",
        json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Manager login failed: {r.status_code} {r.text}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def test_user():
    """Seed a test user directly in MongoDB (Google OAuth not simulatable)."""
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    email = f"{TEST_USER_PREFIX}{uuid.uuid4().hex[:6]}@example.com"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": "TEST_Member",
        "phone": "9999999999",
        "picture": None,
        "role": "user",
        "created_at": datetime.now(timezone.utc),
    }
    _db.users.insert_one(doc)
    yield {"user_id": user_id, "email": email, "name": "TEST_Member"}
    # cleanup
    _db.memberships.delete_many({"user_id": user_id})
    _db.users.delete_one({"user_id": user_id})


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
