from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.user import User
from app.core.security import create_access_token
from app.api.deps import get_current_user

from pydantic import BaseModel


class LoginRequest(BaseModel):
    employee_id: str
    password: str


router = APIRouter()

@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.employee_id == data.employee_id))).scalar_one_or_none()

    if not user or (data.password != user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({
        "user_id": user.id,
        "role": user.role
    })

    return {"access_token": token}


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    return user