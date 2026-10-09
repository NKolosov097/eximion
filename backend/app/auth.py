import hashlib
import secrets
from datetime import timedelta
from threading import BoundedSemaphore
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_session
from app.errors import APIError
from app.models import AuthThrottle, User, UserSession, utc_now
from app.schemas import Account, AuthSession, Credentials, CurrentAccount, LoginCredentials

router = APIRouter(prefix="/api/v1/auth")
SessionDependency = Annotated[Session, Depends(get_session)]
_password_slots = BoundedSemaphore(2)


def password_digest(password: str, salt: bytes) -> str:
    if not _password_slots.acquire(blocking=False):
        raise APIError(429, "auth_busy", "Sign-in is busy. Please try again shortly.")
    try:
        return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000).hex()
    finally:
        _password_slots.release()


def throttle(session: Session, key: str, limit: int):
    now = utc_now()
    session.execute(delete(AuthThrottle).where(AuthThrottle.expires_at <= now))
    key = hashlib.sha256(key.encode()).hexdigest()
    statement = insert(AuthThrottle).values(key=key, count=1, expires_at=now + timedelta(minutes=15))
    expired = AuthThrottle.expires_at <= now
    count = session.scalar(statement.on_conflict_do_update(index_elements=[AuthThrottle.key], set_={
        "count": case((expired, 1), else_=AuthThrottle.count + 1),
        "expires_at": case((expired, now + timedelta(minutes=15)), else_=AuthThrottle.expires_at),
    }).returning(AuthThrottle.count))
    session.commit()
    if count is not None and count > limit:
        raise APIError(429, "auth_throttled", "Too many sign-in attempts. Try again in 15 minutes.")


def optional_user(session: SessionDependency, authorization: Annotated[str | None, Header()] = None) -> User | None:
    if authorization is None:
        return None
    if not authorization.startswith("Bearer ") or len(authorization) > 200:
        raise APIError(401, "session_expired", "Please sign in again.")
    token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
    user = session.scalar(select(User).join(UserSession).where(UserSession.token_hash == token_hash, UserSession.expires_at > utc_now()))
    if user is None:
        raise APIError(401, "session_expired", "Your session expired. Please sign in again.")
    return user


OptionalUser = Annotated[User | None, Depends(optional_user)]


def require_user(user: OptionalUser) -> User:
    if user is None:
        raise APIError(401, "sign_in_required", "Please sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(require_user)]


def issue_session(user: User, response: Response, session: Session) -> AuthSession:
    token = secrets.token_urlsafe(32)
    session.execute(delete(UserSession).where(UserSession.expires_at <= utc_now()))
    session.add(UserSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires_at=utc_now() + timedelta(days=30)))
    session.commit()
    response.headers["Cache-Control"] = "no-store"
    return AuthSession(user=Account(id=user.id, username=user.username), session_token=token)


@router.post("/register", response_model=AuthSession, status_code=201)
def register(data: Credentials, response: Response, session: SessionDependency):
    throttle(session, "registration", 30)
    throttle(session, "login:" + data.username, 10)
    salt = secrets.token_bytes(16)
    user = User(username=data.username, password_hash=salt.hex() + ":" + password_digest(data.password, salt))
    session.add(user)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise APIError(409, "username_unavailable", "This username is unavailable.") from None
    return issue_session(user, response, session)


@router.post("/login", response_model=AuthSession)
def login(data: LoginCredentials, response: Response, session: SessionDependency):
    throttle(session, "login-admission", 100)
    throttle(session, "login:" + data.username, 10)
    user = session.scalar(select(User).where(User.username == data.username))
    salt, expected = user.password_hash.split(":") if user else ("00" * 16, "00" * 32)
    matches = secrets.compare_digest(password_digest(data.password, bytes.fromhex(salt)), expected)
    if user is None or not matches:
        raise APIError(401, "invalid_credentials", "Incorrect username or password.")
    return issue_session(user, response, session)


@router.get("/me", response_model=CurrentAccount)
def me(user: OptionalUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return CurrentAccount(user=Account(id=user.id, username=user.username) if user else None)


@router.post("/logout")
def logout(response: Response, session: SessionDependency, authorization: Annotated[str | None, Header()] = None):
    if authorization and authorization.startswith("Bearer "):
        session.execute(delete(UserSession).where(UserSession.token_hash == hashlib.sha256(authorization[7:].encode()).hexdigest()))
        session.commit()
    response.headers["Cache-Control"] = "no-store"
    return {"signed_out": True}
