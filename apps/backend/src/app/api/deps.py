from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_token
from app.core.db import get_db
from app.models.user import User

security = HTTPBearer(auto_error=False)


async def get_current_user(
    token: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    if token is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )
    try:
        payload = verify_token(token.credentials)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )

    user_id = payload.get("user_id")
    if user_id:
        user_row = await db.get(User, user_id)
        if user_row is not None and not user_row.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="帳號已停用",
            )

    return payload


def require_role(required_role: str):
    async def role_checker(user=Depends(get_current_user)):
        if user.get("role") != required_role:
            raise HTTPException(
                status_code=403,
                detail="Forbidden",
            )
        return user

    return role_checker
