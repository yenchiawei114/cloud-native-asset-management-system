import random
import string

from fastapi.testclient import TestClient

from app.core.config import settings
from datetime import datetime, timedelta


def random_lower_string(n: int = 32) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=n))


def random_email() -> str:
    return f"{random_lower_string()}@{random_lower_string()}.com"


def random_employee_id() -> str:
    return random.choice(string.ascii_uppercase) + "".join(random.choices(string.digits, k=8))


def random_int_id() -> int:
    return random.randint(1, 99)


def random_date() -> datetime:
    start = datetime(2023, 1, 1)
    end = datetime(2026, 4, 30)

    delta = end - start
    random_seconds = random.random() * delta.total_seconds()

    return start + timedelta(seconds=random_seconds)


# def get_superuser_token_headers(client: TestClient) -> dict[str, str]:
#     login_data = {
#         "username": settings.FIRST_SUPERUSER,
#         "password": settings.FIRST_SUPERUSER_PASSWORD,
#     }
#     r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
#     tokens = r.json()
#     a_token = tokens["access_token"]
#     headers = {"Authorization": f"Bearer {a_token}"}
#     return headers

if __name__ == "__main__":
    print(type(random_date()), random_date())
