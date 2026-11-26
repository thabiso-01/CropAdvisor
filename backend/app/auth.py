"""Farmer accounts: sign up and sign in with a phone number or email address plus a password.

- Passwords are hashed with scrypt (Python standard library), each with its own random salt.
- Signing in returns a random token. The apps send it as `Authorization: Bearer <token>`; the
  database keeps only its SHA-256 hash, so a database leak can't be used to sign in.
- Scans made on a device before its owner signed in move into the account on first sign-in.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .db import Analysis, AuthSession, User, get_session
from .ratelimit import client_ip, limiter

SESSION_DAYS = 30
MIN_PASSWORD = 8

# scrypt cost: ~16 MB and a few tens of milliseconds per hash, slow enough to resist guessing.
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


# A real hash to check against when the account doesn't exist, so a wrong phone number takes as
# long to reject as a wrong password (no hint about which accounts exist).
_DUMMY_HASH = hash_password(secrets.token_hex(8))

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_identifier(raw: str) -> str:
    """A phone number in +27… form, or a lower-case email address. Raises 400 if it's neither."""
    value = (raw or "").strip()
    if "@" in value:
        value = value.lower()
        if not _EMAIL.match(value) or len(value) > 254:
            raise HTTPException(400, "Enter a valid email address.")
        return value
    digits = re.sub(r"[\s\-().]", "", value)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if re.fullmatch(r"0\d{9}", digits):  # South African local format: 082 123 4567
        digits = "+27" + digits[1:]
    elif re.fullmatch(r"27\d{9}", digits):
        digits = "+" + digits
    if not re.fullmatch(r"\+\d{8,15}", digits):
        raise HTTPException(400, "Enter a valid phone number (for example 082 123 4567) or email address.")
    return digits


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite returns naive datetimes


def _start_session(session: Session, user: User, device_id: str | None) -> dict:
    token = secrets.token_urlsafe(32)
    session.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, expires_at=_now() + timedelta(days=SESSION_DAYS)))
    if device_id:
        # this device's scans from before signing in now belong to the account
        session.execute(update(Analysis)
                        .where(Analysis.device_id == device_id, Analysis.user_id.is_(None))
                        .values(user_id=user.id))
    session.commit()
    return {"token": token, "user": user_out(user)}


def user_out(user: User) -> dict:
    return {"id": user.id, "name": user.name, "identifier": user.identifier}


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def current_user(authorization: str | None = Header(default=None), session: Session = Depends(get_session)) -> User:
    """Dependency for routes that need a signed-in farmer."""
    token = _bearer(authorization)
    if not token:
        raise HTTPException(401, "Please sign in.")
    row = session.get(AuthSession, _token_hash(token))
    if not row or _aware(row.expires_at) < _now():
        raise HTTPException(401, "Your session has ended. Please sign in again.")
    user = session.get(User, row.user_id)
    if not user:
        raise HTTPException(401, "Please sign in.")
    # keep active farmers signed in: extend the session when it's more than a day old
    if _aware(row.expires_at) - _now() < timedelta(days=SESSION_DAYS - 1):
        row.expires_at = _now() + timedelta(days=SESSION_DAYS)
        session.commit()
    return user


# ------------------------------------------------------------------ routes

router = APIRouter(prefix="/api/auth", tags=["accounts"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    identifier: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=MIN_PASSWORD, max_length=128)


class LoginIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


def _device(x_device_id: str | None) -> str | None:
    dev = (x_device_id or "").strip()[:64]
    return dev if len(dev) >= 8 and dev != "anonymous" else None


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, x_device_id: str | None = Header(default=None),
             session: Session = Depends(get_session)):
    limiter.hit([f"register:ip:{client_ip(request)}"], 10)  # 10 new accounts per address per hour
    identifier = normalize_identifier(body.identifier)
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Enter your name.")
    if session.scalar(select(User).where(User.identifier == identifier)):
        raise HTTPException(409, "An account with this phone number or email already exists. Sign in instead.")
    user = User(name=name, identifier=identifier, password_hash=hash_password(body.password))
    session.add(user)
    session.flush()
    return _start_session(session, user, _device(x_device_id))


@router.post("/login")
def login(body: LoginIn, request: Request, x_device_id: str | None = Header(default=None),
          session: Session = Depends(get_session)):
    try:
        identifier = normalize_identifier(body.identifier)
    except HTTPException:
        identifier = body.identifier.strip().lower()
    # slow down password guessing: per address, and per account from anywhere (15-minute windows)
    limiter.hit([f"login:ip:{client_ip(request)}", f"login:id:{identifier}"], 10, window=900)
    user = session.scalar(select(User).where(User.identifier == identifier))
    if not verify_password(body.password, user.password_hash if user else _DUMMY_HASH) or not user:
        raise HTTPException(401, "Wrong phone number, email or password.")
    return _start_session(session, user, _device(x_device_id))


@router.post("/logout", status_code=204)
def logout(authorization: str | None = Header(default=None), session: Session = Depends(get_session)):
    token = _bearer(authorization)
    if token:
        session.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
        session.commit()


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
