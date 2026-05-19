import random
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from tests.utils.utils import random_email, random_lower_string, random_employee_id, random_int_id, random_date
from app.models.user import User, Role, Sex

# def user_authentication_headers(*, client: TestClient, email: str, password: str) -> dict[str, str]:
#     data = {"username": email, "password": password}

#     r = client.post(f"{settings.API_V1_STR}/login/access-token", data=data)
#     response = r.json()
#     auth_token = response["access_token"]
#     headers = {"Authorization": f"Bearer {auth_token}"}
#     return headers


def create_random_emplyee_user(db: Session) -> User:
    user = User(
        id=random_int_id(),
        employee_id=random_employee_id(),
        password=random_lower_string(),
        name=random_lower_string(10),
        sex=random.choice(list(Sex)),
        department_id=random_int_id(),
        role=Role.EMPLOYEE,
        email=random_email(),
        must_change_password=False,
        last_password_changed_at=None,
        created_at=random_date(),
    )
    return user


def create_random_admin_user(db: Session) -> User:
    user = User(
        id=random_int_id(),
        employee_id=random_employee_id(),
        password=random_lower_string(),
        name=random_lower_string(10),
        sex=random.choice(list(Sex)),
        department_id=random_int_id(),
        role=Role.ADMIN,
        email=random_email(),
        must_change_password=False,
        last_password_changed_at=None,
        created_at=random_date(),
    )
    return user


# def authentication_token_from_email(*, client: TestClient, email: str, db: Session) -> dict[str, str]:
#     """
#     Return a valid token for the user with given email.

#     If the user doesn't exist it is created first.
#     """
#     password = random_lower_string()
#     user = crud.get_user_by_email(session=db, email=email)
#     if not user:
#         user_in_create = UserCreate(email=email, password=password)
#         user = crud.create_user(session=db, user_create=user_in_create)
#     else:
#         user_in_update = UserUpdate(password=password)
#         if not user.id:
#             raise Exception("User id not set")
#         user = crud.update_user(session=db, db_user=user, user_in=user_in_update)

#     return user_authentication_headers(client=client, email=email, password=password)
