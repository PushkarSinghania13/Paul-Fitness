from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import bcrypt
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Razorpay (optional)
RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', '').strip()
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', '').strip()
RAZORPAY_ENABLED = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)
razor_client = None
if RAZORPAY_ENABLED:
    try:
        import razorpay
        razor_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    except Exception as e:
        logging.warning(f"Razorpay init failed: {e}")
        RAZORPAY_ENABLED = False

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------------- Models ----------------
class GoogleSessionIn(BaseModel):
    session_id: str


class ManagerLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    phone: Optional[str] = None
    role: str


class UpdatePhone(BaseModel):
    phone: str


class PlanOut(BaseModel):
    plan_id: str
    name: str
    duration_months: int
    price_inr: int
    description: str


class MembershipOut(BaseModel):
    membership_id: str
    user_id: str
    plan_id: str
    plan_name: str
    duration_months: int
    amount: int
    started_at: datetime
    expires_at: datetime
    payment_method: str
    status: str
    created_at: datetime


class OrderCreate(BaseModel):
    plan_id: str


class PaymentVerify(BaseModel):
    plan_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class RecordCashIn(BaseModel):
    user_id: str
    plan_id: str


class WalkInMemberIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    picture: Optional[str] = None


class MemberUpdateIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    picture: Optional[str] = None


class PlanUpdateIn(BaseModel):
    price_inr: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None


class PushTokenIn(BaseModel):
    token: str
    platform: str


class PhoneOtpRequest(BaseModel):
    phone: str


class PhoneOtpVerify(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None


class CompleteProfileIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


# ---------------- Helpers ----------------
def utcnow():
    return datetime.now(timezone.utc)


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def normalize_dt(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def get_user_by_token(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.replace("Bearer ", "").strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    if normalize_dt(session["expires_at"]) < utcnow():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_manager(authorization: Optional[str]) -> dict:
    user = await get_user_by_token(authorization)
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager only")
    return user


async def compute_active_membership(user_id: str) -> Optional[dict]:
    now = utcnow()
    mems = await db.memberships.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("expires_at", -1).to_list(50)
    for m in mems:
        if normalize_dt(m["expires_at"]) >= now:
            m["status"] = "active"
            return m
    if mems:
        mems[0]["status"] = "expired"
        return mems[0]
    return None


# ---------------- Auth Routes ----------------
@api_router.post("/auth/google/session")
async def google_session(payload: GoogleSessionIn):
    async with httpx.AsyncClient(timeout=10.0) as cli:
        r = await cli.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name", "")),
                      "picture": data.get("picture")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture"),
            "phone": None,
            "role": "user",
            "created_at": utcnow(),
        })
    session_token = data["session_token"]
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": utcnow() + timedelta(days=7),
            "created_at": utcnow(),
        }},
        upsert=True,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user}


@api_router.post("/auth/manager/login")
async def manager_login(payload: ManagerLogin):
    user = await db.users.find_one({"email": payload.email.lower(), "role": "manager"}, {"_id": 0})
    if not user or not verify_pw(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    session_token = f"mgr_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "expires_at": utcnow() + timedelta(days=30),
        "created_at": utcnow(),
    })
    user.pop("password_hash", None)
    return {"session_token": session_token, "user": user}


@api_router.post("/auth/manager/change-password")
async def manager_change_password(payload: ChangePasswordIn, authorization: Optional[str] = Header(None)):
    manager = await require_manager(authorization)
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    full = await db.users.find_one({"user_id": manager["user_id"]})
    if not full or not verify_pw(payload.current_password, full.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    await db.users.update_one(
        {"user_id": manager["user_id"]},
        {"$set": {"password_hash": hash_pw(payload.new_password)}},
    )
    return {"ok": True}


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    user.pop("password_hash", None)
    membership = await compute_active_membership(user["user_id"]) if user["role"] == "user" else None
    return {"user": user, "membership": membership}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}



@api_router.post("/auth/profile/picture")
async def update_profile_picture(payload: dict, authorization: Optional[str] = Header(None)):
    session = await require_auth(authorization)
    user_id = session["user_id"]
    picture = payload.get("picture", "")
    await db.users.update_one({"user_id": user_id}, {"$set": {"picture": picture}})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"ok": True, "user": user}


@api_router.post("/auth/phone")
async def update_phone(payload: UpdatePhone, authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    phone = payload.phone.strip()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"phone": phone}})

    # If a manager-created walk-in exists with the same phone, merge their data
    # into this account so prior cash payments show up here.
    merged = 0
    if phone:
        walkin = await db.users.find_one(
            {"phone": phone, "role": "user", "walk_in": True, "user_id": {"$ne": user["user_id"]}},
            {"_id": 0},
        )
        if walkin:
            walk_id = walkin["user_id"]
            r = await db.memberships.update_many(
                {"user_id": walk_id}, {"$set": {"user_id": user["user_id"]}}
            )
            merged = r.modified_count
            await db.payment_orders.update_many(
                {"user_id": walk_id}, {"$set": {"user_id": user["user_id"]}}
            )
            await db.user_sessions.delete_many({"user_id": walk_id})
            await db.push_tokens.delete_many({"user_id": walk_id})
            await db.users.delete_one({"user_id": walk_id})
    return {"ok": True, "merged_memberships": merged}


@api_router.post("/auth/complete-profile")
async def complete_profile(payload: CompleteProfileIn, authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    updates = {}
    if payload.name is not None and payload.name.strip():
        updates["name"] = payload.name.strip()
    new_phone = (payload.phone or "").strip() if payload.phone is not None else None
    if new_phone:
        updates["phone"] = new_phone
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})

    merged = 0
    if new_phone:
        walkin = await db.users.find_one(
            {"phone": new_phone, "role": "user", "walk_in": True, "user_id": {"$ne": user["user_id"]}},
            {"_id": 0},
        )
        if walkin:
            walk_id = walkin["user_id"]
            r = await db.memberships.update_many(
                {"user_id": walk_id}, {"$set": {"user_id": user["user_id"]}}
            )
            merged = r.modified_count
            await db.payment_orders.update_many({"user_id": walk_id}, {"$set": {"user_id": user["user_id"]}})
            await db.user_sessions.delete_many({"user_id": walk_id})
            await db.push_tokens.delete_many({"user_id": walk_id})
            await db.users.delete_one({"user_id": walk_id})

    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    updated.pop("password_hash", None)
    return {"ok": True, "user": updated, "merged_memberships": merged}


# ---------------- Phone OTP Login (MOCK SMS) ----------------
@api_router.post("/auth/phone/request-otp")
async def request_otp(payload: PhoneOtpRequest):
    phone = payload.phone.strip()
    if not phone or len(phone) < 7:
        raise HTTPException(status_code=400, detail="Enter a valid phone number")
    code = f"{random.randint(0, 999999):06d}"
    await db.otps.update_one(
        {"phone": phone},
        {"$set": {
            "phone": phone,
            "code": code,
            "expires_at": utcnow() + timedelta(minutes=5),
            "attempts": 0,
            "created_at": utcnow(),
        }},
        upsert=True,
    )
    logger.info(f"[OTP MOCK] phone={phone} code={code}")
    # MOCK: return code so frontend can show it. Replace with Twilio SMS in prod.
    return {"ok": True, "dev_otp": code, "message": "OTP sent (MOCK)"}


@api_router.post("/auth/phone/verify-otp")
async def verify_otp(payload: PhoneOtpVerify):
    phone = payload.phone.strip()
    code = payload.code.strip()
    rec = await db.otps.find_one({"phone": phone}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="OTP not requested for this number")
    if normalize_dt(rec["expires_at"]) < utcnow():
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")
    if rec.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new OTP.")
    if rec["code"] != code:
        await db.otps.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")
    await db.otps.delete_one({"phone": phone})

    # Find existing user by phone (role=user)
    user = await db.users.find_one({"phone": phone, "role": "user"}, {"_id": 0})
    is_new = False
    if not user:
        is_new = True
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        email = f"phone_{uuid.uuid4().hex[:10]}@paulfitness.local"
        new_doc = {
            "user_id": user_id,
            "email": email,
            "name": (payload.name or "").strip() or "",
            "phone": phone,
            "picture": None,
            "role": "user",
            "phone_signup": True,
            "created_at": utcnow(),
        }
        await db.users.insert_one(new_doc)
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    elif user.get("walk_in"):
        # Walk-in member is verifying their phone — convert to a real account.
        unset = {"walk_in": ""}
        sets = {"phone_signup": True}
        if payload.name and payload.name.strip() and not user.get("name"):
            sets["name"] = payload.name.strip()
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": sets, "$unset": unset},
        )
        user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})

    # If walk-in exists for this phone (different user_id) merge into the resolved user
    other_walkin = await db.users.find_one(
        {"phone": phone, "role": "user", "walk_in": True, "user_id": {"$ne": user["user_id"]}},
        {"_id": 0},
    )
    if other_walkin:
        walk_id = other_walkin["user_id"]
        await db.memberships.update_many({"user_id": walk_id}, {"$set": {"user_id": user["user_id"]}})
        await db.payment_orders.update_many({"user_id": walk_id}, {"$set": {"user_id": user["user_id"]}})
        await db.user_sessions.delete_many({"user_id": walk_id})
        await db.push_tokens.delete_many({"user_id": walk_id})
        await db.users.delete_one({"user_id": walk_id})

    session_token = f"ph_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "expires_at": utcnow() + timedelta(days=30),
        "created_at": utcnow(),
    })
    user.pop("password_hash", None)
    return {"session_token": session_token, "user": user, "is_new": is_new}


# ---------------- Plans ----------------
@api_router.get("/plans", response_model=List[PlanOut])
async def list_plans():
    plans = await db.plans.find({}, {"_id": 0}).sort("duration_months", 1).to_list(100)
    return plans


# ---------------- Gym Info ----------------
@api_router.get("/gym-info")
async def gym_info():
    return {
        "name": "PAUL FITNESS GYM",
        "address": "GMXH+7H, Munshefdanga, Raghunathpur North, Raghunathpur, West Bengal 723133",
        "phone": "07908283507",
    }


# ---------------- Memberships ----------------
@api_router.get("/memberships/me")
async def my_membership(authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    active = await compute_active_membership(user["user_id"])
    history = await db.memberships.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"current": active, "history": history}


# ---------------- Payments ----------------
@api_router.get("/payments/config")
async def payments_config():
    return {"razorpay_enabled": RAZORPAY_ENABLED, "razorpay_key_id": RAZORPAY_KEY_ID if RAZORPAY_ENABLED else ""}


@api_router.post("/payments/order")
async def create_order(payload: OrderCreate, authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    plan = await db.plans.find_one({"plan_id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not RAZORPAY_ENABLED:
        raise HTTPException(status_code=400, detail="Online payments not configured. Please pay cash at gym.")
    order_data = razor_client.order.create({
        "amount": plan["price_inr"] * 100,
        "currency": "INR",
        "payment_capture": 1,
        "notes": {"user_id": user["user_id"], "plan_id": plan["plan_id"]},
    })
    await db.payment_orders.insert_one({
        "order_id": order_data["id"],
        "user_id": user["user_id"],
        "plan_id": plan["plan_id"],
        "amount": plan["price_inr"],
        "status": "created",
        "created_at": utcnow(),
    })
    return {
        "order_id": order_data["id"],
        "amount": order_data["amount"],
        "currency": "INR",
        "key_id": RAZORPAY_KEY_ID,
        "name": user["name"],
        "email": user["email"],
        "contact": user.get("phone") or "",
    }


@api_router.post("/payments/verify")
async def verify_payment(payload: PaymentVerify, authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    if not RAZORPAY_ENABLED:
        raise HTTPException(status_code=400, detail="Razorpay not configured")
    try:
        razor_client.utility.verify_payment_signature({
            "razorpay_order_id": payload.razorpay_order_id,
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")
    plan = await db.plans.find_one({"plan_id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    membership = await _create_membership(user["user_id"], plan, "online", payload.razorpay_payment_id, None)
    await db.payment_orders.update_one(
        {"order_id": payload.razorpay_order_id},
        {"$set": {"status": "paid", "payment_id": payload.razorpay_payment_id}},
    )
    return {"ok": True, "membership": membership}


async def _create_membership(user_id: str, plan: dict, method: str, payment_id: Optional[str], recorded_by: Optional[str]):
    now = utcnow()
    # If user already has an active membership, extend from that expiry
    existing = await compute_active_membership(user_id)
    if existing and existing.get("status") == "active":
        start = normalize_dt(existing["expires_at"])
    else:
        start = now
    expires = start + timedelta(days=plan["duration_months"] * 30)
    mem = {
        "membership_id": f"mem_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "plan_id": plan["plan_id"],
        "plan_name": plan["name"],
        "duration_months": plan["duration_months"],
        "amount": plan["price_inr"],
        "started_at": start,
        "expires_at": expires,
        "payment_method": method,
        "payment_id": payment_id,
        "recorded_by": recorded_by,
        "status": "active",
        "created_at": now,
    }
    await db.memberships.insert_one(mem)
    mem.pop("_id", None)
    return mem


# ---------------- Push Tokens ----------------
@api_router.post("/push/register")
async def register_push(payload: PushTokenIn, authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    await db.push_tokens.update_one(
        {"user_id": user["user_id"], "token": payload.token},
        {"$set": {
            "user_id": user["user_id"],
            "token": payload.token,
            "platform": payload.platform,
            "updated_at": utcnow(),
        }},
        upsert=True,
    )
    return {"ok": True}


# ---------------- Manager Routes ----------------
@api_router.get("/manager/members")
async def manager_members(authorization: Optional[str] = Header(None), q: Optional[str] = None, status: Optional[str] = None):
    await require_manager(authorization)
    query = {"role": "user"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    users = await db.users.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    now = utcnow()
    results = []
    for u in users:
        active = await compute_active_membership(u["user_id"])
        member_status = "none"
        days_remaining = None
        if active:
            exp = normalize_dt(active["expires_at"])
            days = (exp - now).days
            if days < 0:
                member_status = "expired"
            elif days <= 5:
                member_status = "expiring"
            else:
                member_status = "active"
            days_remaining = days
        item = {
            "user_id": u["user_id"],
            "name": u["name"],
            "email": u["email"],
            "phone": u.get("phone"),
            "picture": u.get("picture"),
            "status": member_status,
            "days_remaining": days_remaining,
            "current_plan": active,
        }
        if status and status != "all" and member_status != status:
            continue
        results.append(item)
    return results


@api_router.get("/manager/members/{user_id}")
async def manager_member_detail(user_id: str, authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    u = await db.users.find_one({"user_id": user_id, "role": "user"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Member not found")
    active = await compute_active_membership(user_id)
    history = await db.memberships.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"user": u, "current": active, "history": history}


@api_router.post("/manager/record-cash")
async def manager_record_cash(payload: RecordCashIn, authorization: Optional[str] = Header(None)):
    manager = await require_manager(authorization)
    plan = await db.plans.find_one({"plan_id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    u = await db.users.find_one({"user_id": payload.user_id, "role": "user"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Member not found")
    mem = await _create_membership(payload.user_id, plan, "cash", None, manager["user_id"])
    return {"ok": True, "membership": mem}


@api_router.post("/manager/members")
async def manager_create_walkin(payload: WalkInMemberIn, authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    name = payload.name.strip()
    phone = payload.phone.strip()
    if not name or not phone:
        raise HTTPException(status_code=400, detail="Name and phone are required")
    email = (payload.email or "").strip().lower()

    # Try to link to an existing user (by email first, then by phone).
    existing = None
    if email:
        existing = await db.users.find_one({"email": email, "role": "user"}, {"_id": 0})
    if not existing and phone:
        existing = await db.users.find_one({"phone": phone, "role": "user"}, {"_id": 0})

    if existing:
        # Reuse the existing account; backfill any missing fields (don't overwrite real data).
        updates = {}
        if not existing.get("phone"):
            updates["phone"] = phone
        if not existing.get("name"):
            updates["name"] = name
        if updates:
            await db.users.update_one({"user_id": existing["user_id"]}, {"$set": updates})
            existing.update(updates)
        return {"ok": True, "user": existing, "linked": True}

    if not email:
        email = f"walkin_{uuid.uuid4().hex[:10]}@paulfitness.local"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "phone": phone,
        "picture": None,
        "role": "user",
        "walk_in": True,
        "created_at": utcnow(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "user": doc, "linked": False}


@api_router.patch("/manager/members/{user_id}")
async def manager_update_member(user_id: str, payload: MemberUpdateIn, authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    u = await db.users.find_one({"user_id": user_id, "role": "user"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Member not found")
    updates = {}
    if payload.name is not None and payload.name.strip():
        updates["name"] = payload.name.strip()
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    if payload.picture is not None:
        updates["picture"] = payload.picture
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"ok": True, "user": user}


@api_router.delete("/manager/members/{user_id}")
async def manager_delete_member(user_id: str, authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    u = await db.users.find_one({"user_id": user_id, "role": "user"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.users.delete_one({"user_id": user_id})
    await db.memberships.delete_many({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.push_tokens.delete_many({"user_id": user_id})
    return {"ok": True}



@api_router.patch("/manager/plans/{plan_id}")
async def manager_update_plan(plan_id: str, payload: PlanUpdateIn, authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    updates = {}
    if payload.price_inr is not None and payload.price_inr > 0:
        updates["price_inr"] = payload.price_inr
    if payload.name is not None and payload.name.strip():
        updates["name"] = payload.name.strip()
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.plans.update_one({"plan_id": plan_id}, {"$set": updates})
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    return {"ok": True, "plan": plan}



@api_router.post("/manager/plans")
async def manager_create_plan(payload: dict, authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    name = (payload.get("name") or "").strip()
    duration_months = payload.get("duration_months")
    price_inr = payload.get("price_inr")
    description = (payload.get("description") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Plan name is required")
    if not duration_months or int(duration_months) <= 0:
        raise HTTPException(status_code=400, detail="Valid duration is required")
    if not price_inr or int(price_inr) <= 0:
        raise HTTPException(status_code=400, detail="Valid price is required")
    plan_id = f"plan_{uuid.uuid4().hex[:8]}"
    plan = {
        "plan_id": plan_id,
        "name": name,
        "duration_months": int(duration_months),
        "price_inr": int(price_inr),
        "description": description,
    }
    await db.plans.insert_one(plan)
    plan.pop("_id", None)
    return {"ok": True, "plan": plan}


@api_router.delete("/manager/plans/{plan_id}")
async def manager_delete_plan(plan_id: str, authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.plans.delete_one({"plan_id": plan_id})
    return {"ok": True}


@api_router.get("/manager/stats")
async def manager_stats(authorization: Optional[str] = Header(None)):
    await require_manager(authorization)
    now = utcnow()
    users = await db.users.find({"role": "user"}, {"_id": 0}).to_list(5000)
    total = len(users)
    active = expiring = expired = 0
    for u in users:
        m = await compute_active_membership(u["user_id"])
        if not m:
            continue
        days = (normalize_dt(m["expires_at"]) - now).days
        if days < 0:
            expired += 1
        elif days <= 5:
            expiring += 1
        else:
            active += 1
    return {"total": total, "active": active, "expiring": expiring, "expired": expired}


# ---------------- Seed ----------------
@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.plans.create_index("plan_id", unique=True)
    await db.memberships.create_index("user_id")
    await db.otps.create_index("expires_at", expireAfterSeconds=0)

    # Seed plans
    plans_seed = [
        {"plan_id": "plan_1m", "name": "Monthly", "duration_months": 1, "price_inr": 1000, "description": "Full gym access for 1 month."},
        {"plan_id": "plan_3m", "name": "Quarterly", "duration_months": 3, "price_inr": 2500, "description": "3 months unlimited training & equipment."},
        {"plan_id": "plan_6m", "name": "Half-Year", "duration_months": 6, "price_inr": 4500, "description": "6 months with personal guidance."},
        {"plan_id": "plan_12m", "name": "Annual", "duration_months": 12, "price_inr": 8000, "description": "Full year — best value, includes diet plan."},
    ]
    for p in plans_seed:
        await db.plans.update_one({"plan_id": p["plan_id"]}, {"$set": p}, upsert=True)

    # Seed manager
    mgr_email = os.environ.get("MANAGER_EMAIL", "manager@paulfitness.com").lower()
    mgr_password = os.environ.get("MANAGER_PASSWORD", "Paul@Manager123")
    existing = await db.users.find_one({"email": mgr_email})
    if not existing:
        await db.users.insert_one({
            "user_id": f"mgr_{uuid.uuid4().hex[:10]}",
            "email": mgr_email,
            "name": "Paul Fitness Manager",
            "role": "manager",
            "password_hash": hash_pw(mgr_password),
            "picture": None,
            "phone": "07908283507",
            "created_at": utcnow(),
        })
        logger.info(f"Seeded manager: {mgr_email}")
    else:
        # ensure password updated to env value (idempotent)
        await db.users.update_one(
            {"email": mgr_email},
            {"$set": {"password_hash": hash_pw(mgr_password), "role": "manager"}},
        )


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
