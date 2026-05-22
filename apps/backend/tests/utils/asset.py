from sqlalchemy.orm import Session

from app.models import Asset
from tests.utils.user import create_random_emplyee_user
from tests.utils.utils import random_lower_string


def create_random_asset(db: Session) -> Asset:
    pass
