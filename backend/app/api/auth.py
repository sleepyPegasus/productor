"""Authentication API endpoints: login, register, email verification, password change."""

import logging
import smtplib
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException, Depends

from app.config import settings
from app.db.database import (
    create_user,
    create_verification_code,
    get_user_by_email,
    get_user_by_id,
    get_user_by_username,
    update_user_password,
    verify_code,
    verify_user_password,
)
from app.models.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    SendVerificationRequest,
    TokenResponse,
    UserResponse,
)
from app.api.deps import create_token, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    user = verify_user_password(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="账号已被禁用")
    token = create_token(user["id"])
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/send-code")
async def send_verification_code(body: SendVerificationRequest):
    """Send a 6-digit verification code to the given email."""
    if body.purpose == "register":
        existing = get_user_by_email(body.email)
        if existing:
            raise HTTPException(status_code=400, detail="该邮箱已被注册")

    code = create_verification_code(body.email, body.purpose)

    # Try sending via SMTP if configured, otherwise log to console
    if settings.SMTP_HOST:
        try:
            _send_email(
                to=body.email,
                subject="Productor 验证码",
                body=f"您的验证码是: {code}\n\n验证码有效期为 10 分钟。",
            )
        except Exception as e:
            logger.error("Failed to send email to %s: %s", body.email, e)
            raise HTTPException(status_code=500, detail="邮件发送失败，请稍后重试")
    else:
        # Dev mode: log the code
        logger.warning("=== DEV MODE: Verification code for %s is: %s ===", body.email, code)

    return {"detail": "验证码已发送", "dev_code": code if not settings.SMTP_HOST else None}


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest):
    # Validate verification code
    if not verify_code(body.email, body.verification_code, "register"):
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    # Check duplicates
    if get_user_by_username(body.username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    if get_user_by_email(body.email):
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = create_user(body.username, body.email, body.password)
    token = create_token(user["id"])
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return current_user


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    # Verify old password
    user = verify_user_password(current_user["username"], body.old_password)
    if not user:
        raise HTTPException(status_code=400, detail="当前密码不正确")

    update_user_password(current_user["id"], body.new_password)
    return {"detail": "密码修改成功"}


def _send_email(to: str, subject: str, body: str):
    """Send an email via SMTP."""
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM, [to], msg.as_string())
