from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone


def random_lower_string(length: int = 10) -> str:
    return "".join(random.choice(string.ascii_lowercase) for _ in range(length))


def random_email() -> str:
    return f"{random_lower_string(12)}@example.com"


def random_employee_id() -> str:
    return f"E{random.randint(10000000, 99999999)}"


def random_date() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=random.randint(0, 365))
