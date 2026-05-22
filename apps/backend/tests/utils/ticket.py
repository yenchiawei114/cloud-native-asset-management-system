from sqlalchemy.orm import Session

from app.models.ticket import RepairRequest
from tests.utils.user import create_random_emplyee_user
from tests.utils.utils import random_lower_string


def create_random_repair_request(db: Session) -> RepairRequest:
    pass
