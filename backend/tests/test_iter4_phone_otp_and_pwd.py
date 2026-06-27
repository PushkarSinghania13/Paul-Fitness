"""
Iteration 4 backend tests:
- Phone OTP request/verify (MOCK SMS, dev_otp in response)
- Walk-in merge on OTP verify
- /api/auth/complete-profile (auth-gated, merge walk-in)
- /api/auth/manager/change-password (validate + restore at end)
- Regression-safe: cleans up created users/sessions/otps.
"""
import os
import uuid
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else os.environ["EXPO_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

MANAGER_EMAIL = "manager@paulfitness.com"
MANAGER_PASSWORD = "Paul@Manager123"

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

_created_phones = []
_created_user_ids = []
_created_session_tokens = []


def _uniq_phone(prefix="99"):
    p = f"{prefix}{uuid.uuid4().int % 100000000:08d}"
    _created_phones.append(p)
    return p


@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    # Cleanup
    for p in _created_phones:
        db.otps.delete_many({"phone": p})
        users = list(db.users.find({"phone": p}))
        for u in users:
            db.user_sessions.delete_many({"user_id": u["user_id"]})
            db.memberships.delete_many({"user_id": u["user_id"]})
            db.push_tokens.delete_many({"user_id": u["user_id"]})
            if u.get("role") == "user":  # don't touch manager
                db.users.delete_one({"user_id": u["user_id"]})
    for uid in _created_user_ids:
        db.user_sessions.delete_many({"user_id": uid})
        db.memberships.delete_many({"user_id": uid})
        db.users.delete_one({"user_id": uid})
    for tok in _created_session_tokens:
        db.user_sessions.delete_one({"session_token": tok})


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# =============== Phone OTP ===============
class TestPhoneOtpRequest:
    def test_request_otp_returns_6digit_code(self, api):
        phone = _uniq_phone()
        r = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "dev_otp" in body
        assert isinstance(body["dev_otp"], str) and len(body["dev_otp"]) == 6
        assert body["dev_otp"].isdigit()
        assert "message" in body
        # No _id leakage
        assert "_id" not in body

    def test_request_otp_replaces_previous_code(self, api):
        phone = _uniq_phone()
        r1 = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
        c1 = r1.json()["dev_otp"]
        r2 = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
        c2 = r2.json()["dev_otp"]
        # Verify DB has only the latest code
        rec = db.otps.find_one({"phone": phone})
        assert rec is not None
        assert rec["code"] == c2
        # First code should no longer work
        v = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": c1})
        # Either invalid (if c1 != c2) or fine (rare collision); assert behavior
        if c1 != c2:
            assert v.status_code == 400

    def test_request_otp_short_phone_400(self, api):
        r = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": "12345"})
        assert r.status_code == 400

    def test_request_otp_empty_phone_400(self, api):
        r = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": "   "})
        assert r.status_code == 400


# =============== Phone OTP Verify ===============
class TestPhoneOtpVerify:
    def test_verify_creates_new_user_is_new_true(self, api):
        phone = _uniq_phone()
        r = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
        code = r.json()["dev_otp"]
        v = api.post(
            f"{BASE_URL}/api/auth/phone/verify-otp",
            json={"phone": phone, "code": code, "name": "TEST_PhoneUser"},
        )
        assert v.status_code == 200, v.text
        body = v.json()
        assert "session_token" in body and body["session_token"].startswith("ph_")
        assert body["is_new"] is True
        assert "_id" not in body
        u = body["user"]
        assert "_id" not in u
        assert u["phone"] == phone
        assert u["role"] == "user"
        assert u.get("phone_signup") is True
        assert u["email"].startswith("phone_") and u["email"].endswith("@paulfitness.local")
        assert u["name"] == "TEST_PhoneUser"
        _created_session_tokens.append(body["session_token"])
        _created_user_ids.append(u["user_id"])

        # OTP should be deleted after successful verify
        assert db.otps.find_one({"phone": phone}) is None

    def test_verify_reuses_existing_user_is_new_false(self, api):
        phone = _uniq_phone()
        # First signup
        code = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone}).json()["dev_otp"]
        v1 = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": code})
        uid1 = v1.json()["user"]["user_id"]
        _created_user_ids.append(uid1)
        _created_session_tokens.append(v1.json()["session_token"])

        # Second OTP for same phone
        code2 = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone}).json()["dev_otp"]
        v2 = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": code2})
        assert v2.status_code == 200
        body = v2.json()
        assert body["is_new"] is False
        assert body["user"]["user_id"] == uid1
        _created_session_tokens.append(body["session_token"])

    def test_verify_wrong_code_increments_attempts(self, api):
        phone = _uniq_phone()
        api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
        for i in range(1, 4):
            r = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": "000000"})
            # Could collide rarely; if collides, skip
            if r.status_code == 200:
                pytest.skip("OTP collision (extremely rare)")
            assert r.status_code == 400, r.text
            rec = db.otps.find_one({"phone": phone})
            assert rec["attempts"] == i

    def test_verify_429_after_5_attempts(self, api):
        phone = _uniq_phone()
        api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
        # Force attempts to 5 via DB
        db.otps.update_one({"phone": phone}, {"$set": {"attempts": 5}})
        r = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": "000000"})
        assert r.status_code == 429

    def test_verify_expired_otp_400(self, api):
        phone = _uniq_phone()
        api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone})
        # Expire it
        db.otps.update_one(
            {"phone": phone},
            {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}},
        )
        code = db.otps.find_one({"phone": phone})["code"]
        r = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": code})
        assert r.status_code == 400
        assert "expire" in r.json().get("detail", "").lower()

    def test_verify_not_requested_400(self, api):
        phone = _uniq_phone()
        # Ensure not present
        db.otps.delete_many({"phone": phone})
        r = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": "123456"})
        assert r.status_code == 400

    def test_verify_merges_walkin(self, api):
        phone = _uniq_phone()
        # Create a walk-in user via manager
        mgr_tok = _manager_login(api)
        wr = api.post(
            f"{BASE_URL}/api/manager/members",
            json={"name": "TEST_Walkin", "phone": phone},
            headers={"Authorization": f"Bearer {mgr_tok}"},
        )
        assert wr.status_code == 200
        walk_uid = wr.json()["user"]["user_id"]
        # Record cash so a membership exists
        cash = api.post(
            f"{BASE_URL}/api/manager/record-cash",
            json={"user_id": walk_uid, "plan_id": "plan_1m"},
            headers={"Authorization": f"Bearer {mgr_tok}"},
        )
        assert cash.status_code == 200

        # Now phone signup with same phone — implementation finds walk-in by phone+role=user
        # and reuses it (is_new=False). Memberships are preserved on the same user_id.
        code = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone}).json()["dev_otp"]
        v = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": code, "name": "Phone Owner"})
        assert v.status_code == 200, v.text
        body = v.json()
        resolved_uid = body["user"]["user_id"]
        # The resolved user reuses the walk-in record (since same phone+role=user)
        assert resolved_uid == walk_uid
        assert body["is_new"] is False
        _created_user_ids.append(resolved_uid)
        _created_session_tokens.append(body["session_token"])

        # Membership previously recorded for the walk-in is now accessible to the phone user
        mems = list(db.memberships.find({"user_id": resolved_uid}))
        assert len(mems) >= 1, "Cash membership should still be on the resolved user_id"
        # /memberships/me should return it for the phone session
        me_mem = api.get(
            f"{BASE_URL}/api/memberships/me",
            headers={"Authorization": f"Bearer {body['session_token']}"},
        )
        assert me_mem.status_code == 200
        history = me_mem.json().get("history", [])
        assert len(history) >= 1


# =============== /auth/me with phone session ===============
class TestAuthMeWithPhoneSession:
    def test_me_returns_phone_user(self, api):
        phone = _uniq_phone()
        code = api.post(f"{BASE_URL}/api/auth/phone/request-otp", json={"phone": phone}).json()["dev_otp"]
        v = api.post(f"{BASE_URL}/api/auth/phone/verify-otp", json={"phone": phone, "code": code, "name": "TEST_MeUser"})
        tok = v.json()["session_token"]
        uid = v.json()["user"]["user_id"]
        _created_session_tokens.append(tok)
        _created_user_ids.append(uid)

        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        body = me.json()
        assert body["user"]["user_id"] == uid
        assert body["user"]["phone"] == phone
        assert body["user"]["role"] == "user"
        assert "_id" not in body
        assert "_id" not in body["user"]
        # Newly created => no membership
        assert body["membership"] is None


# =============== Complete Profile ===============
def _manager_login(api):
    r = api.post(f"{BASE_URL}/api/auth/manager/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json()["session_token"]
    _created_session_tokens.append(tok)
    return tok


def _seed_google_user(name="TEST_Google", phone=None):
    """Directly seed a google-like user + session in DB."""
    uid = f"user_{uuid.uuid4().hex[:12]}"
    email = f"test_google_{uuid.uuid4().hex[:8]}@example.com"
    db.users.insert_one({
        "user_id": uid,
        "email": email,
        "name": name,
        "phone": phone,
        "picture": None,
        "role": "user",
        "created_at": datetime.now(timezone.utc),
    })
    tok = f"gs_{uuid.uuid4().hex}"
    db.user_sessions.insert_one({
        "session_token": tok,
        "user_id": uid,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    _created_user_ids.append(uid)
    _created_session_tokens.append(tok)
    return uid, tok


class TestCompleteProfile:
    def test_no_auth_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/complete-profile", json={"name": "X", "phone": "9999999999"})
        assert r.status_code == 401

    def test_empty_body_returns_400(self, api):
        _, tok = _seed_google_user()
        r = api.post(
            f"{BASE_URL}/api/auth/complete-profile",
            json={},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 400

    def test_updates_name_and_phone(self, api):
        uid, tok = _seed_google_user()
        phone = _uniq_phone()
        r = api.post(
            f"{BASE_URL}/api/auth/complete-profile",
            json={"name": "TEST_NewName", "phone": phone},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["merged_memberships"] == 0
        assert body["user"]["user_id"] == uid
        assert body["user"]["name"] == "TEST_NewName"
        assert body["user"]["phone"] == phone
        assert "_id" not in body
        assert "_id" not in body["user"]

    def test_merges_walkin(self, api):
        # Create walk-in
        mgr_tok = _manager_login(api)
        phone = _uniq_phone()
        wr = api.post(
            f"{BASE_URL}/api/manager/members",
            json={"name": "TEST_W", "phone": phone},
            headers={"Authorization": f"Bearer {mgr_tok}"},
        )
        walk_uid = wr.json()["user"]["user_id"]
        cash = api.post(
            f"{BASE_URL}/api/manager/record-cash",
            json={"user_id": walk_uid, "plan_id": "plan_3m"},
            headers={"Authorization": f"Bearer {mgr_tok}"},
        )
        assert cash.status_code == 200

        # Seed a google user (no phone yet)
        uid, tok = _seed_google_user(name="Google No Phone")
        r = api.post(
            f"{BASE_URL}/api/auth/complete-profile",
            json={"name": "Google With Phone", "phone": phone},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["merged_memberships"] >= 1
        assert body["user"]["user_id"] == uid
        assert body["user"]["phone"] == phone
        # Walk-in user gone
        assert db.users.find_one({"user_id": walk_uid}) is None
        # Memberships transferred
        assert db.memberships.count_documents({"user_id": uid}) >= 1


# =============== Manager Change Password ===============
class TestManagerChangePassword:
    NEW_PWD = "TEST_NewMgrPwd_8plus!"

    def test_no_token_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/manager/change-password",
                     json={"current_password": MANAGER_PASSWORD, "new_password": self.NEW_PWD})
        assert r.status_code in (401, 403)

    def test_non_manager_token_returns_403(self, api):
        _, tok = _seed_google_user()
        r = api.post(
            f"{BASE_URL}/api/auth/manager/change-password",
            json={"current_password": MANAGER_PASSWORD, "new_password": self.NEW_PWD},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 403

    def test_short_new_password_returns_400(self, api):
        tok = _manager_login(api)
        r = api.post(
            f"{BASE_URL}/api/auth/manager/change-password",
            json={"current_password": MANAGER_PASSWORD, "new_password": "short"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 400

    def test_wrong_current_password_returns_401(self, api):
        tok = _manager_login(api)
        r = api.post(
            f"{BASE_URL}/api/auth/manager/change-password",
            json={"current_password": "WrongPassword123", "new_password": self.NEW_PWD},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 401

    def test_change_then_restore_password(self, api):
        # CRITICAL: this test changes and restores the password.
        tok = _manager_login(api)

        # Change
        r = api.post(
            f"{BASE_URL}/api/auth/manager/change-password",
            json={"current_password": MANAGER_PASSWORD, "new_password": self.NEW_PWD},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        assert "_id" not in r.json()

        # Old password should fail
        r_old = api.post(f"{BASE_URL}/api/auth/manager/login",
                        json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
        assert r_old.status_code == 401

        # New password should succeed
        r_new = api.post(f"{BASE_URL}/api/auth/manager/login",
                        json={"email": MANAGER_EMAIL, "password": self.NEW_PWD})
        assert r_new.status_code == 200
        new_tok = r_new.json()["session_token"]
        _created_session_tokens.append(new_tok)

        # RESTORE original password
        restore = api.post(
            f"{BASE_URL}/api/auth/manager/change-password",
            json={"current_password": self.NEW_PWD, "new_password": MANAGER_PASSWORD},
            headers={"Authorization": f"Bearer {new_tok}"},
        )
        assert restore.status_code == 200, restore.text

        # Verify original works again
        r_orig = api.post(f"{BASE_URL}/api/auth/manager/login",
                         json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD})
        assert r_orig.status_code == 200, "Manager password NOT restored! Fix manually."
        _created_session_tokens.append(r_orig.json()["session_token"])
