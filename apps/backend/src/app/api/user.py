from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.audit import log_action
from app.core.db import get_db
from app.models import NotificationPreference, User
from app.models.audit_log import Action, TargetType
from app.models.notification_preference import NoteType
from app.models.user import Role, Sex

router = APIRouter()
admin_required = require_role("ADMIN")


def _normalize_note_type(value: str) -> NoteType:
	key = value.strip().upper()
	try:
		return NoteType[key]
	except KeyError as exc:
		raise HTTPException(status_code=422, detail="invalid notification type") from exc


def _role_to_str(role: Role) -> str:
	return role.name


def _sex_to_str(sex: Sex) -> str:
	return sex.name


class UserRegisterRequest(BaseModel):
	employee_id: str = Field(min_length=9, max_length=9)
	password: str = Field(min_length=1)
	name: str
	sex: Literal["MALE", "FEMALE"] = "MALE"
	department_id: int
	email: str


class AdminCreateUserRequest(UserRegisterRequest):
	role: Literal["EMPLOYEE", "ADMIN"] = "EMPLOYEE"


class ChangePasswordPayload(BaseModel):
	current_password: str = Field(min_length=1)
	new_password: str = Field(min_length=1)


class NotificationPreferencePayload(BaseModel):
	type: Literal["EMAIL", "SLACK", "TEAMS"]
	value: str


class NotificationPreferenceOut(BaseModel):
	id: int
	user_id: int
	type: str
	value: str


class UserOut(BaseModel):
	id: int
	employee_id: str
	name: str
	sex: str
	department_id: int
	role: str
	email: str
	must_change_password: bool
	last_password_changed_at: datetime | None
	created_at: datetime


class UserUpdateByAdmin(BaseModel):
	name: str | None = None
	sex: Literal["MALE", "FEMALE"] | None = None
	department_id: int | None = None
	role: Literal["EMPLOYEE", "ADMIN"] | None = None
	email: str | None = None
	password: str | None = None


def _user_to_out(row: User) -> UserOut:
	return UserOut(
		id=row.id,
		employee_id=row.employee_id,
		name=row.name,
		sex=_sex_to_str(row.sex),
		department_id=row.department_id,
		role=_role_to_str(row.role),
		email=row.email,
		must_change_password=row.must_change_password,
		last_password_changed_at=row.last_password_changed_at,
		created_at=row.created_at,
	)


def _pref_to_out(row: NotificationPreference) -> NotificationPreferenceOut:
	return NotificationPreferenceOut(
		id=row.id,
		user_id=row.user_id,
		type=row.type.name,
		value=row.value,
	)


async def _register_with_role(
	payload: UserRegisterRequest,
	role: Role,
	db: AsyncSession,
	actor_id: int,
	actor_name: str,
) -> UserOut:
	existing = (await db.execute(select(User).where(User.employee_id == payload.employee_id))).scalar_one_or_none()
	if existing is not None:
		raise HTTPException(status_code=409, detail="employee id already exists")

	row = User(
		employee_id=payload.employee_id,
		password=payload.password,
		name=payload.name,
		sex=Sex[payload.sex],
		department_id=payload.department_id,
		role=role,
		email=payload.email,
		must_change_password=True,
		last_password_changed_at=None,
	)
	db.add(row)
	await db.flush()

	# 預設通知偏好為公司信箱
	default_pref = NotificationPreference(user_id=row.id, type=NoteType.EMAIL, value=row.email)
	db.add(default_pref)

	safe_detail = {k: v for k, v in payload.model_dump(mode="json").items() if k != "password"}
	await log_action(
		db,
		user_id=actor_id,
		actor_name=actor_name,
		action=Action.CREATE,
		target_type=TargetType.USER,
		target_id=row.id,
		target_name=f"{row.name} ({row.employee_id})",
		detail={"after": safe_detail},
	)

	await db.commit()
	await db.refresh(row)
	return _user_to_out(row)

# @router.post("/admins/register", response_model=UserOut, status_code=201)
# async def register_admin(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)) -> UserOut:
# 	return await _register_with_role(payload=payload, role=Role.ADMIN, db=db)


@router.get("/users/me", response_model=UserOut)
async def get_my_profile(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> UserOut:
	user_id = user.get("user_id")
	row = await db.get(User, user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)


@router.put("/users/me/password")
async def change_my_password(
	payload: ChangePasswordPayload,
	user=Depends(get_current_user),
	db: AsyncSession = Depends(get_db),
) -> dict:
	user_id = user.get("user_id")
	row = await db.get(User, user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	if row.password != payload.current_password:
		raise HTTPException(status_code=401, detail="invalid current password")
	if payload.current_password == payload.new_password:
		raise HTTPException(status_code=422, detail="new password must be different")

	row.password = payload.new_password
	row.must_change_password = False
	row.last_password_changed_at = datetime.now(timezone.utc)
	await db.commit()

	return {"message": "password updated"}


@router.get("/users/me/notification-preferences", response_model=list[NotificationPreferenceOut])
async def list_my_notification_preferences(
	user=Depends(get_current_user),
	db: AsyncSession = Depends(get_db),
) -> list[NotificationPreferenceOut]:
	user_id = user.get("user_id")
	rows = (
		await db.scalars(
			select(NotificationPreference)
			.where(NotificationPreference.user_id == user_id)
			.order_by(NotificationPreference.id.desc())
		)
	).all()
	return [_pref_to_out(r) for r in rows]


@router.put("/users/me/notification-preferences", response_model=NotificationPreferenceOut)
async def upsert_my_notification_preference(
	payload: NotificationPreferencePayload,
	user=Depends(get_current_user),
	db: AsyncSession = Depends(get_db),
) -> NotificationPreferenceOut:
	user_id = user.get("user_id")
	note_type = _normalize_note_type(payload.type)

	row = (
		await db.execute(
			select(NotificationPreference).where(
				NotificationPreference.user_id == user_id,
				NotificationPreference.type == note_type,
			)
		)
	).scalar_one_or_none()

	if row is None:
		row = NotificationPreference(user_id=user_id, type=note_type, value=payload.value)
		db.add(row)
	else:
		row.value = payload.value

	await db.commit()
	await db.refresh(row)
	return _pref_to_out(row)


@router.post("/users", response_model=UserOut, status_code=201)
async def admin_create_user(
	payload: AdminCreateUserRequest,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	return await _register_with_role(
		payload=payload,
		role=Role[payload.role],
		db=db,
		actor_id=user["user_id"],
		actor_name=user["name"],
	)


@router.get("/users", response_model=list[UserOut])
async def admin_list_users(
	keyword: str | None = None,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> list[UserOut]:
	stmt = select(User).order_by(User.id.desc())
	if keyword:
		like = f"%{keyword}%"
		stmt = stmt.where((User.employee_id.like(like)) | (User.name.like(like)) | (User.email.like(like)))

	rows = (await db.scalars(stmt)).all()
	return [_user_to_out(r) for r in rows]


@router.get("/users/{target_user_id}", response_model=UserOut)
async def admin_get_user(
	target_user_id: int,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	row = await db.get(User, target_user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)


@router.put("/users/{target_user_id}", response_model=UserOut)
async def admin_update_user(
	target_user_id: int,
	payload: UserUpdateByAdmin,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	row = await db.get(User, target_user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")

	before = _user_to_out(row).model_dump(mode="json")

	if payload.name is not None:
		row.name = payload.name
	if payload.sex is not None:
		row.sex = Sex[payload.sex]
	if payload.department_id is not None:
		row.department_id = payload.department_id
	if payload.role is not None:
		row.role = Role[payload.role]
	if payload.email is not None:
		row.email = payload.email
	if payload.password is not None:
		row.password = payload.password

	after = _user_to_out(row).model_dump(mode="json")
	await log_action(
		db,
		user_id=user["user_id"],
		actor_name=user["name"],
		action=Action.UPDATE,
		target_type=TargetType.USER,
		target_id=target_user_id,
		target_name=f"{row.name} ({row.employee_id})",
		detail={"before": before, "after": after},
	)
	await db.commit()
	await db.refresh(row)
	return _user_to_out(row)


@router.delete("/users/{target_user_id}", status_code=204)
async def admin_delete_user(
	target_user_id: int,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> None:
	if target_user_id == user["user_id"]:
		raise HTTPException(status_code=400, detail="cannot delete yourself")

	row = await db.get(User, target_user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")

	before = _user_to_out(row).model_dump(mode="json")
	target_name = f"{row.name} ({row.employee_id})"
	await db.delete(row)
	await log_action(
		db,
		user_id=user["user_id"],
		actor_name=user["name"],
		action=Action.DELETE,
		target_type=TargetType.USER,
		target_id=target_user_id,
		target_name=target_name,
		detail={"before": before},
	)
	try:
		await db.commit()
	except IntegrityError:
		await db.rollback()
		raise HTTPException(status_code=409, detail="cannot delete user with existing records")
