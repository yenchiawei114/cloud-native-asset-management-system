from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.security import verify_token

security = HTTPBearer(auto_error=False)


def get_current_user(token: HTTPAuthorizationCredentials = Depends(security),):
    if token is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    try:
        return verify_token(token.credentials)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )


def require_role(required_role: str):
    def role_checker(user=Depends(get_current_user)):
        if not user or user.get("role") != required_role:
            raise HTTPException(
                status_code=403,
                detail="Forbidden",
            )
        return user

    return role_checker