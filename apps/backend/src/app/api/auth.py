from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.limiter import limiter
from app.core.security import create_access_token, verify_password
from app.models.user import User


class LoginRequest(BaseModel):
    employee_id: str
    password: str


router = APIRouter()

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.employee_id == data.employee_id))).scalar_one_or_none()

    if not user or not verify_password(data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="帳號已停用")

    token = create_access_token({
        "user_id": user.id,
        "role": user.role.name,
        "employee_id": user.employee_id,
        "name": user.name,
    })

    return {
        "access_token": token,
        "must_change_password": user.must_change_password,
    }


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    return user


@router.post("/logout")
async def logout(user=Depends(get_current_user)):
    return {"message": "logout success"}