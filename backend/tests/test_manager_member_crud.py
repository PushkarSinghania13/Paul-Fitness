"""Iteration 2: Manager member CRUD tests
- POST /api/manager/members (walk-in create)
- PATCH /api/manager/members/{user_id}
- DELETE /api/manager/members/{user_id} (with cascade cleanup)
- Regression smoke for iteration-1 endpoints (/api/plans, /api/manager/stats, /api/manager/members list)
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
).rstrip("/")

MANAGER_EMAIL = "manager@paulfitness.com"
MANAGER_PASSWORD = "Paul@Manager123"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "paul_fitness")
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


# ----------------- Helpers / Fixtures -----------------
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


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def auth_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}


# Track created user_ids so we cleanup leftovers even on test failure
_created_user_ids: list[str] = []


def _cleanup_user(uid: str):
    _db.users.delete_one({"user_id": uid})
    _db.memberships.delete_many({"user_id": uid})
    _db.user_sessions.delete_many({"user_id": uid})
    _db.push_tokens.delete_many({"user_id": uid})


@pytest.fixture(autouse=True, scope="module")
def _final_cleanup():
    yield
    for uid in _created_user_ids:
        _cleanup_user(uid)


# ----------------- POST /api/manager/members (walk-in) -----------------
class TestWalkInCreate:
    def test_walkin_no_token_unauthorized(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            json={"name": "TEST_NoAuth", "phone": "9000000001"},
        )
        assert r.status_code in (401, 403), r.text

    def test_walkin_missing_name_returns_400(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "  ", "phone": "9000000002"},
        )
        # FastAPI may produce 422 on validator constraints — accept either 400 or 422.
        assert r.status_code in (400, 422), r.text

    def test_walkin_missing_phone_returns_400(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_NoPhone", "phone": "  "},
        )
        assert r.status_code in (400, 422), r.text

    def test_walkin_missing_phone_field_returns_422(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_OnlyName"},
        )
        # Pydantic missing required field
        assert r.status_code in (400, 422)

    def test_walkin_auto_email(self, api_client, auth_headers):
        name = f"TEST_Walkin_{uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": name, "phone": "9111111111"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        u = body["user"]
        _created_user_ids.append(u["user_id"])
        assert u["name"] == name
        assert u["phone"] == "9111111111"
        assert u["role"] == "user"
        assert u["walk_in"] is True
        assert u["email"].endswith("@paulfitness.local")
        assert u["email"].startswith("walkin_")
        assert "_id" not in u
        # Persisted in DB
        db_doc = _db.users.find_one({"user_id": u["user_id"]})
        assert db_doc is not None
        assert db_doc["walk_in"] is True

    def test_walkin_explicit_email_used(self, api_client, auth_headers):
        email = f"TEST_explicit_{uuid.uuid4().hex[:6]}@example.com"
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_Explicit", "phone": "9222222222", "email": email},
        )
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        _created_user_ids.append(u["user_id"])
        assert u["email"] == email.lower()

    def test_walkin_duplicate_email_now_links(self, api_client, auth_headers):
        # Iteration 3: duplicate email no longer returns 409; instead returns linked=true
        # and reuses the existing user_id.
        email = f"TEST_dup_{uuid.uuid4().hex[:6]}@example.com"
        r1 = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_Dup1", "phone": "9333333333", "email": email},
        )
        assert r1.status_code == 200, r1.text
        first_uid = r1.json()["user"]["user_id"]
        _created_user_ids.append(first_uid)

        r2 = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_Dup2", "phone": "9333333334", "email": email},
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["linked"] is True
        assert body["user"]["user_id"] == first_uid
        # existing name was NOT overwritten
        assert body["user"]["name"] == "TEST_Dup1"


# ----------------- PATCH /api/manager/members/{user_id} -----------------
class TestMemberUpdate:
    @pytest.fixture
    def created_member(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_PatchMe", "phone": "9444444444"},
        )
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        _created_user_ids.append(u["user_id"])
        return u

    def test_patch_no_token_unauthorized(self, api_client, created_member):
        r = api_client.patch(
            f"{BASE_URL}/api/manager/members/{created_member['user_id']}",
            json={"name": "NewName"},
        )
        assert r.status_code in (401, 403)

    def test_patch_updates_name_and_phone(self, api_client, auth_headers, created_member):
        r = api_client.patch(
            f"{BASE_URL}/api/manager/members/{created_member['user_id']}",
            headers=auth_headers,
            json={"name": "TEST_NewName", "phone": "9999999999"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        u = body["user"]
        assert u["name"] == "TEST_NewName"
        assert u["phone"] == "9999999999"
        assert "_id" not in u
        # confirm in DB
        db_doc = _db.users.find_one({"user_id": created_member["user_id"]})
        assert db_doc["name"] == "TEST_NewName"
        assert db_doc["phone"] == "9999999999"

    def test_patch_empty_body_returns_400(self, api_client, auth_headers, created_member):
        r = api_client.patch(
            f"{BASE_URL}/api/manager/members/{created_member['user_id']}",
            headers=auth_headers,
            json={},
        )
        assert r.status_code == 400, r.text

    def test_patch_invalid_user_id_404(self, api_client, auth_headers):
        r = api_client.patch(
            f"{BASE_URL}/api/manager/members/user_does_not_exist_xyz",
            headers=auth_headers,
            json={"name": "Anything"},
        )
        assert r.status_code == 404, r.text


# ----------------- DELETE /api/manager/members/{user_id} (cascade) -----------------
class TestMemberDeleteCascade:
    def test_delete_no_token_unauthorized(self, api_client):
        r = api_client.delete(f"{BASE_URL}/api/manager/members/user_anything")
        assert r.status_code in (401, 403)

    def test_delete_nonexistent_returns_404(self, api_client, auth_headers):
        r = api_client.delete(
            f"{BASE_URL}/api/manager/members/user_no_such_user_zzz",
            headers=auth_headers,
        )
        assert r.status_code == 404, r.text

    def test_delete_cascades_memberships_sessions_pushtokens(self, api_client, auth_headers):
        # 1. Create walk-in
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_DeleteCascade", "phone": "9555555555"},
        )
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["user_id"]

        # 2. Record a cash payment so a membership exists
        cash = api_client.post(
            f"{BASE_URL}/api/manager/record-cash",
            headers=auth_headers,
            json={"user_id": uid, "plan_id": "plan_1m"},
        )
        assert cash.status_code == 200, cash.text

        # 3. Manually seed a user_session and a push_token (Google OAuth not simulatable)
        _db.user_sessions.insert_one({
            "session_token": f"test_sess_{uuid.uuid4().hex}",
            "user_id": uid,
            "expires_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })
        _db.push_tokens.insert_one({
            "user_id": uid,
            "token": f"ExponentPushToken[TEST_{uuid.uuid4().hex[:8]}]",
            "platform": "ios",
            "updated_at": datetime.now(timezone.utc),
        })

        # Sanity: docs exist pre-delete
        assert _db.users.find_one({"user_id": uid}) is not None
        assert _db.memberships.count_documents({"user_id": uid}) >= 1
        assert _db.user_sessions.count_documents({"user_id": uid}) >= 1
        assert _db.push_tokens.count_documents({"user_id": uid}) >= 1

        # 4. DELETE
        d = api_client.delete(
            f"{BASE_URL}/api/manager/members/{uid}",
            headers=auth_headers,
        )
        assert d.status_code == 200, d.text
        assert d.json() == {"ok": True}

        # 5. Verify cascade
        assert _db.users.find_one({"user_id": uid}) is None
        assert _db.memberships.count_documents({"user_id": uid}) == 0
        assert _db.user_sessions.count_documents({"user_id": uid}) == 0
        assert _db.push_tokens.count_documents({"user_id": uid}) == 0

        # 6. GET member detail returns 404
        g = api_client.get(
            f"{BASE_URL}/api/manager/members/{uid}",
            headers=auth_headers,
        )
        assert g.status_code == 404


# ----------------- Full e2e: walk-in -> cash -> detail -> patch -> delete -----------------
class TestFullE2EWalkInLifecycle:
    def test_e2e(self, api_client, auth_headers):
        # 1. create walk-in
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "TEST_E2E", "phone": "9666666666"},
        )
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["user_id"]

        # 2. record cash
        cash = api_client.post(
            f"{BASE_URL}/api/manager/record-cash",
            headers=auth_headers,
            json={"user_id": uid, "plan_id": "plan_3m"},
        )
        assert cash.status_code == 200, cash.text
        mem = cash.json()["membership"]
        assert mem["plan_name"] == "Quarterly"
        assert mem["payment_method"] == "cash"
        assert "_id" not in mem

        # 3. fetch detail -> active
        det = api_client.get(
            f"{BASE_URL}/api/manager/members/{uid}",
            headers=auth_headers,
        )
        assert det.status_code == 200, det.text
        body = det.json()
        assert body["current"] is not None
        assert body["current"]["status"] == "active"
        assert "_id" not in body["user"]
        for h in body["history"]:
            assert "_id" not in h

        # 4. patch name
        patched = api_client.patch(
            f"{BASE_URL}/api/manager/members/{uid}",
            headers=auth_headers,
            json={"name": "TEST_E2E_Updated"},
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["user"]["name"] == "TEST_E2E_Updated"

        # 5. delete
        d = api_client.delete(
            f"{BASE_URL}/api/manager/members/{uid}",
            headers=auth_headers,
        )
        assert d.status_code == 200, d.text

        # 6. verify gone
        g = api_client.get(
            f"{BASE_URL}/api/manager/members/{uid}",
            headers=auth_headers,
        )
        assert g.status_code == 404


# ----------------- Iteration-1 regression -----------------
class TestIteration1Regression:
    def test_plans_still_4(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/plans")
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) == 4
        for p in plans:
            assert "_id" not in p

    def test_stats_keys(self, api_client, auth_headers):
        r = api_client.get(
            f"{BASE_URL}/api/manager/stats", headers=auth_headers
        )
        assert r.status_code == 200
        body = r.json()
        for k in ("total", "active", "expiring", "expired"):
            assert isinstance(body[k], int)

    def test_members_list_no_id_leak(self, api_client, auth_headers):
        r = api_client.get(
            f"{BASE_URL}/api/manager/members", headers=auth_headers
        )
        assert r.status_code == 200
        for m in r.json():
            assert "_id" not in m
