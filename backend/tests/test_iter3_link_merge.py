"""Iteration 3: Walk-in linking + /api/auth/phone merge tests.

- POST /api/manager/members links to existing user by email (priority) or phone.
- /api/auth/phone merges any walk-in with the same phone into the authenticated
  (Google) user account, transferring memberships and deleting the walk-in.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
).rstrip("/")

MANAGER_EMAIL = "manager@paulfitness.com"
MANAGER_PASSWORD = "Paul@Manager123"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


# ---------- Fixtures ----------
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
def auth_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


_created_user_ids: list[str] = []
_created_session_tokens: list[str] = []


def _track(uid):
    _created_user_ids.append(uid)
    return uid


def _cleanup(uid):
    _db.users.delete_one({"user_id": uid})
    _db.memberships.delete_many({"user_id": uid})
    _db.user_sessions.delete_many({"user_id": uid})
    _db.push_tokens.delete_many({"user_id": uid})
    _db.payment_orders.delete_many({"user_id": uid})


@pytest.fixture(autouse=True, scope="module")
def _final_cleanup():
    yield
    for uid in _created_user_ids:
        _cleanup(uid)
    for tok in _created_session_tokens:
        _db.user_sessions.delete_one({"session_token": tok})


# ---------- Helpers ----------
def _seed_google_user(email: str, name: str = "Google User", phone=None) -> str:
    uid = f"user_{uuid.uuid4().hex[:12]}"
    _db.users.insert_one({
        "user_id": uid,
        "email": email,
        "name": name,
        "picture": None,
        "phone": phone,
        "role": "user",  # NOTE: no walk_in flag => Google-like account
        "created_at": datetime.now(timezone.utc),
    })
    _track(uid)
    return uid


def _seed_session(user_id: str) -> str:
    token = f"test_sess_{uuid.uuid4().hex}"
    _db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    _created_session_tokens.append(token)
    return token


def _create_walkin(client, headers, name, phone, email=None) -> dict:
    payload = {"name": name, "phone": phone}
    if email:
        payload["email"] = email
    r = client.post(f"{BASE_URL}/api/manager/members", headers=headers, json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    _track(body["user"]["user_id"])
    return body


# =====================================================================
# Section A: POST /api/manager/members linking behavior
# =====================================================================
class TestWalkInLinking:
    def test_link_by_email_priority_over_phone(self, api_client, auth_headers):
        """Email match wins over phone match."""
        email_target = f"test_email_priority_{uuid.uuid4().hex[:6]}@example.com"
        # Seed a "Google" user with this email and NO phone
        google_uid = _seed_google_user(email_target, name="Email Owner", phone=None)

        # Seed a different walk-in user with a phone we'll send in payload
        walkin_phone = f"95{uuid.uuid4().hex[:8]}"
        walkin_body = _create_walkin(
            api_client, auth_headers, "Some Walkin",
            walkin_phone, email=f"different_{uuid.uuid4().hex[:6]}@example.com",
        )
        walkin_uid = walkin_body["user"]["user_id"]
        assert walkin_uid != google_uid

        # POST /api/manager/members with email=email_target + phone=walkin_phone
        # -> should link to google_uid (email priority)
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "Ignored Name", "phone": walkin_phone, "email": email_target},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["linked"] is True
        assert body["user"]["user_id"] == google_uid
        # name should NOT be overwritten (existing had "Email Owner")
        assert body["user"]["name"] == "Email Owner"
        # phone was missing -> filled in
        assert body["user"]["phone"] == walkin_phone
        assert "_id" not in body["user"]

    def test_link_by_phone_when_no_email_match(self, api_client, auth_headers):
        """When email doesn't match any user but phone does -> link by phone."""
        phone_target = f"94{uuid.uuid4().hex[:8]}"
        google_uid = _seed_google_user(
            f"phone_owner_{uuid.uuid4().hex[:6]}@example.com",
            name="Phone Owner",
            phone=phone_target,
        )

        new_email = f"brand_new_{uuid.uuid4().hex[:6]}@example.com"
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "Should Not Override", "phone": phone_target, "email": new_email},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["linked"] is True
        assert body["user"]["user_id"] == google_uid
        # name preserved
        assert body["user"]["name"] == "Phone Owner"
        # email is NOT updated by the link (existing email kept)
        assert body["user"]["email"] != new_email
        assert "_id" not in body["user"]

    def test_link_backfills_missing_name_and_phone(self, api_client, auth_headers):
        """Existing user missing name -> filled; missing phone -> filled."""
        email = f"empty_fields_{uuid.uuid4().hex[:6]}@example.com"
        uid = f"user_{uuid.uuid4().hex[:12]}"
        _db.users.insert_one({
            "user_id": uid,
            "email": email,
            "name": "",  # missing
            "phone": None,  # missing
            "role": "user",
            "created_at": datetime.now(timezone.utc),
        })
        _track(uid)

        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "Filled Name", "phone": "9876500000", "email": email},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["linked"] is True
        assert body["user"]["user_id"] == uid
        assert body["user"]["name"] == "Filled Name"
        assert body["user"]["phone"] == "9876500000"

    def test_new_walkin_creates_fresh_user(self, api_client, auth_headers):
        """Fresh email + phone -> linked=false, new walk-in user created."""
        email = f"fresh_{uuid.uuid4().hex[:6]}@example.com"
        phone = f"93{uuid.uuid4().hex[:8]}"
        body = _create_walkin(api_client, auth_headers, "Fresh User", phone, email=email)
        assert body["linked"] is False
        assert body["user"]["walk_in"] is True
        assert body["user"]["email"] == email.lower()

    def test_link_to_existing_then_record_cash_no_duplicate(self, api_client, auth_headers):
        """After link, cash creates membership on same user_id; total count unchanged."""
        email = f"link_cash_{uuid.uuid4().hex[:6]}@example.com"
        google_uid = _seed_google_user(email, name="Existing Acct", phone=None)

        # count before
        before_count = _db.users.count_documents({"role": "user"})

        # Manager adds a "walk-in" with same email -> link
        r = api_client.post(
            f"{BASE_URL}/api/manager/members",
            headers=auth_headers,
            json={"name": "Walk-in attempt", "phone": "9876512345", "email": email},
        )
        assert r.status_code == 200, r.text
        assert r.json()["linked"] is True
        assert r.json()["user"]["user_id"] == google_uid

        # count after - must be unchanged (no duplicate)
        after_count = _db.users.count_documents({"role": "user"})
        assert after_count == before_count, "Linking should NOT create a new user"

        # Record cash on that user_id
        cash = api_client.post(
            f"{BASE_URL}/api/manager/record-cash",
            headers=auth_headers,
            json={"user_id": google_uid, "plan_id": "plan_1m"},
        )
        assert cash.status_code == 200, cash.text

        # GET detail shows the membership
        det = api_client.get(
            f"{BASE_URL}/api/manager/members/{google_uid}",
            headers=auth_headers,
        )
        assert det.status_code == 200
        body = det.json()
        assert body["current"] is not None
        assert body["current"]["status"] == "active"
        assert body["current"]["payment_method"] == "cash"
        assert "_id" not in body["user"]
        for m in body["history"]:
            assert "_id" not in m


# =====================================================================
# Section B: POST /api/auth/phone merge behavior
# =====================================================================
class TestPhoneMerge:
    def test_phone_merge_transfers_walkin_memberships(self, api_client, auth_headers):
        """Google user updates phone matching a walk-in -> memberships moved, walk-in deleted."""
        # 1. Create walk-in via manager API with phone
        merge_phone = f"92{uuid.uuid4().hex[:8]}"
        walkin = _create_walkin(api_client, auth_headers, "Walk-in Member", merge_phone)
        walkin_uid = walkin["user"]["user_id"]

        # 2. Record cash to give walk-in a membership
        cash = api_client.post(
            f"{BASE_URL}/api/manager/record-cash",
            headers=auth_headers,
            json={"user_id": walkin_uid, "plan_id": "plan_3m"},
        )
        assert cash.status_code == 200, cash.text

        # 3. Seed a Google-like user (role=user, no walk_in flag) + session
        google_email = f"google_merge_{uuid.uuid4().hex[:6]}@example.com"
        google_uid = _seed_google_user(google_email, name="Google Person", phone=None)
        token = _seed_session(google_uid)

        # 4. Sanity counts before
        assert _db.memberships.count_documents({"user_id": walkin_uid}) == 1
        assert _db.memberships.count_documents({"user_id": google_uid}) == 0

        # 5. Call POST /api/auth/phone with the walk-in's phone
        r = api_client.post(
            f"{BASE_URL}/api/auth/phone",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": merge_phone},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["merged_memberships"] == 1
        # no _id leakage
        assert "_id" not in body

        # 6. Walk-in user deleted
        assert _db.users.find_one({"user_id": walkin_uid}) is None
        # Memberships moved
        assert _db.memberships.count_documents({"user_id": walkin_uid}) == 0
        assert _db.memberships.count_documents({"user_id": google_uid}) == 1

        # 7. Google user has the phone set
        gu = _db.users.find_one({"user_id": google_uid})
        assert gu["phone"] == merge_phone

        # Remove walkin from tracker since already deleted
        if walkin_uid in _created_user_ids:
            _created_user_ids.remove(walkin_uid)

    def test_phone_update_no_walkin_no_merge(self, api_client):
        """When no walk-in matches phone, update succeeds with merged_memberships=0."""
        google_email = f"google_nomerge_{uuid.uuid4().hex[:6]}@example.com"
        google_uid = _seed_google_user(google_email, name="Solo", phone=None)
        token = _seed_session(google_uid)
        unique_phone = f"91{uuid.uuid4().hex[:8]}"

        before_total = _db.users.count_documents({"role": "user"})
        r = api_client.post(
            f"{BASE_URL}/api/auth/phone",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": unique_phone},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["merged_memberships"] == 0
        # No users deleted
        assert _db.users.count_documents({"role": "user"}) == before_total
        # Phone updated
        gu = _db.users.find_one({"user_id": google_uid})
        assert gu["phone"] == unique_phone

    def test_phone_merge_does_not_touch_manager_role(self, api_client):
        """A manager user with the same phone must NOT be merged (role filter)."""
        # Manager already exists with phone 07908283507 (seeded). Pick that.
        manager_phone = "07908283507"
        mgr = _db.users.find_one({"email": MANAGER_EMAIL.lower()})
        assert mgr is not None
        assert mgr["role"] == "manager"

        # Seed Google user + session
        google_uid = _seed_google_user(
            f"google_mgrphone_{uuid.uuid4().hex[:6]}@example.com",
            name="Trying Manager Phone",
        )
        token = _seed_session(google_uid)

        r = api_client.post(
            f"{BASE_URL}/api/auth/phone",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": manager_phone},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # No walk-in with that phone exists -> 0 merged. Crucially, manager not deleted.
        assert body["merged_memberships"] == 0
        # Manager still exists with unchanged role
        m2 = _db.users.find_one({"email": MANAGER_EMAIL.lower()})
        assert m2 is not None
        assert m2["role"] == "manager"

    def test_phone_merge_cascade_cleans_sessions_and_push_tokens(self, api_client, auth_headers):
        """After merge, the walk-in's user_sessions and push_tokens are also removed."""
        merge_phone = f"90{uuid.uuid4().hex[:8]}"
        walkin = _create_walkin(api_client, auth_headers, "Cascade Walk-in", merge_phone)
        walkin_uid = walkin["user"]["user_id"]

        # Seed walk-in's session + push token directly
        wsess = f"walkin_sess_{uuid.uuid4().hex}"
        _db.user_sessions.insert_one({
            "session_token": wsess,
            "user_id": walkin_uid,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
            "created_at": datetime.now(timezone.utc),
        })
        _db.push_tokens.insert_one({
            "user_id": walkin_uid,
            "token": f"ExponentPushToken[CASCADE_{uuid.uuid4().hex[:8]}]",
            "platform": "android",
            "updated_at": datetime.now(timezone.utc),
        })

        # Seed Google user + session
        google_uid = _seed_google_user(
            f"google_cascade_{uuid.uuid4().hex[:6]}@example.com",
            name="Cascade Google",
        )
        token = _seed_session(google_uid)

        # Sanity
        assert _db.user_sessions.count_documents({"user_id": walkin_uid}) == 1
        assert _db.push_tokens.count_documents({"user_id": walkin_uid}) == 1

        # Trigger merge
        r = api_client.post(
            f"{BASE_URL}/api/auth/phone",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": merge_phone},
        )
        assert r.status_code == 200, r.text

        # Walk-in's session & push token removed
        assert _db.user_sessions.count_documents({"user_id": walkin_uid}) == 0
        assert _db.push_tokens.count_documents({"user_id": walkin_uid}) == 0
        assert _db.users.find_one({"user_id": walkin_uid}) is None

        if walkin_uid in _created_user_ids:
            _created_user_ids.remove(walkin_uid)
