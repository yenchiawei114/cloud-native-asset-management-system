from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_role
from app.core.audit import log_action
from app.core.db import get_db
from app.core.security import hash_password, verify_password
from app.models import Department, NotificationPreference, OfficeLocation, User
from app.models.asset import Asset, AssetStatus, AssetTransfer
from app.models.audit_log import Action, TargetType
from app.models.notification_preference import NoteType
from app.models.ticket import RepairRequest
from app.models.user import Role, Sex

router = APIRouter()
admin_required = require_role("ADMIN")


# Pure business logic functions (testable without DB/HTTP layer)
def validate_password_change(current_password: str, new_password: str) -> None:
	"""
	Validate password change constraints.
	
	Raises HTTPException if validation fails.
	"""
	if current_password == new_password:
		raise HTTPException(status_code=422, detail="new password must be different")


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


class DepartmentOut(BaseModel):
	id: int
	name: str


class OfficeLocationOut(BaseModel):
	id: int
	name: str


class UserRegisterRequest(BaseModel):
	employee_id: str = Field(min_length=9, max_length=9)
	password: str = Field(min_length=1)
	name: str
	sex: Literal["MALE", "FEMALE"] = "MALE"
	department_id: int
	location: str | None = None
	email: str


class AdminCreateUserRequest(UserRegisterRequest):
	role: Literal["EMPLOYEE", "ADMIN"] = "EMPLOYEE"
	hire_date: date | None = None


class VerifyPasswordPayload(BaseModel):
	current_password: str = Field(min_length=1)


class ChangePasswordPayload(BaseModel):
	current_password: str = Field(min_length=1)
	new_password: str = Field(min_length=1)


class ChangeEmailPayload(BaseModel):
	email: str = Field(min_length=1)


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
	location: str | None
	role: str
	email: str
	must_change_password: bool
	last_password_changed_at: datetime | None
	hire_date: date | None
	termination_date: date | None
	is_active: bool
	created_at: datetime


class UserUpdateByAdmin(BaseModel):
	name: str | None = None
	sex: Literal["MALE", "FEMALE"] | None = None
	department_id: int | None = None
	location: str | None = None
	role: Literal["EMPLOYEE", "ADMIN"] | None = None
	email: str | None = None
	password: str | None = None
	hire_date: date | None = None
	termination_date: date | None = None


def _user_to_out(row: User) -> UserOut:
	return UserOut(
		id=row.id,
		employee_id=row.employee_id,
		name=row.name,
		sex=_sex_to_str(row.sex),
		department_id=row.department_id,
		location=row.location.name if row.location else None,
		role=_role_to_str(row.role),
		email=row.email,
		must_change_password=row.must_change_password,
		last_password_changed_at=row.last_password_changed_at,
		hire_date=row.hire_date,
		termination_date=row.termination_date,
		is_active=row.is_active,
		created_at=row.created_at,
	)


async def _get_user_for_out(db: AsyncSession, user_id: int) -> User | None:
	return (
		await db.scalars(
			select(User)
			.options(selectinload(User.location))
			.where(User.id == user_id)
		)
	).first()


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

	location = None
	if payload.location:
		location = (
			await db.scalars(
				select(OfficeLocation).where(OfficeLocation.name == payload.location)
			)
		).first()
		if location is None:
			raise HTTPException(status_code=400, detail="invalid location")

	row = User(
		employee_id=payload.employee_id,
		password=hash_password(payload.password),
		name=payload.name,
		sex=Sex[payload.sex],
		department_id=payload.department_id,
		location_id=location.id if location else None,
		role=role,
		email=payload.email,
		must_change_password=True,
		last_password_changed_at=None,
		hire_date=getattr(payload, "hire_date", None),
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
	row = await _get_user_for_out(db, row.id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)

# @router.post("/admins/register", response_model=UserOut, status_code=201)
# async def register_admin(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)) -> UserOut:
# 	return await _register_with_role(payload=payload, role=Role.ADMIN, db=db)


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)) -> list[DepartmentOut]:
	rows = (await db.scalars(select(Department).order_by(Department.id.asc()))).all()
	return [DepartmentOut(id=r.id, name=r.name) for r in rows]


@router.get("/office-locations", response_model=list[OfficeLocationOut])
async def list_office_locations(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)) -> list[OfficeLocationOut]:
	rows = (await db.scalars(select(OfficeLocation).order_by(OfficeLocation.id.asc()))).all()
	return [OfficeLocationOut(id=r.id, name=r.name) for r in rows]


@router.get("/users/me", response_model=UserOut)
async def get_my_profile(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> UserOut:
	user_id = user.get("user_id")
	row = await _get_user_for_out(db, user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)


@router.post("/users/me/verify-password")
async def verify_my_password(
	payload: VerifyPasswordPayload,
	user=Depends(get_current_user),
	db: AsyncSession = Depends(get_db),
) -> dict:
	user_id = user.get("user_id")
	row = await db.get(User, user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	if not verify_password(payload.current_password, row.password):
		raise HTTPException(status_code=401, detail="invalid current password")
	return {"valid": True}


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
	if not verify_password(payload.current_password, row.password):
		raise HTTPException(status_code=401, detail="invalid current password")
	
	# Validate password change constraints (pure logic, testable)
	validate_password_change(payload.current_password, payload.new_password)

	row.password = hash_password(payload.new_password)
	row.must_change_password = False
	row.last_password_changed_at = datetime.now(UTC)
	await log_action(
		db,
		user_id=user_id,
		actor_name=user.get("name"),
		action=Action.UPDATE,
		target_type=TargetType.USER,
		target_id=user_id,
		target_name=row.name,
		detail={"action": "password_changed"},
	)
	await db.commit()

	return {"message": "password updated"}


@router.put("/users/me/email", response_model=UserOut)
async def change_my_email(
	payload: ChangeEmailPayload,
	user=Depends(get_current_user),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	user_id = user.get("user_id")
	row = await _get_user_for_out(db, user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")

	before_email = row.email
	row.email = payload.email
	await log_action(
		db,
		user_id=user_id,
		actor_name=user.get("name"),
		action=Action.UPDATE,
		target_type=TargetType.USER,
		target_id=user_id,
		target_name=row.name,
		detail={"before": {"email": before_email}, "after": {"email": payload.email}},
	)
	await db.commit()
	row = await _get_user_for_out(db, user_id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)


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
		audit_action = Action.CREATE
		audit_detail: dict = {"type": note_type.value, "after": payload.value}
	else:
		audit_detail = {"type": note_type.value, "before": row.value, "after": payload.value}
		row.value = payload.value
		audit_action = Action.UPDATE

	await log_action(
		db,
		user_id=user_id,
		actor_name=user.get("name"),
		action=audit_action,
		target_type=TargetType.USER,
		target_id=user_id,
		target_name=user.get("name"),
		detail=audit_detail,
	)
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
	stmt = select(User).options(selectinload(User.location)).order_by(User.id.desc())
	if keyword:
		like = f"%{keyword}%"
		stmt = stmt.where((User.employee_id.like(like)) | (User.name.like(like)) | (User.email.like(like)))

	rows = (await db.scalars(stmt)).all()
	return [_user_to_out(r) for r in rows]


@router.get("/users/{target_employee_id}", response_model=UserOut)
async def admin_get_user(
	target_employee_id: str,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	row = (
		await db.execute(select(User).options(selectinload(User.location)).where(User.employee_id == target_employee_id))
	).scalar_one_or_none()
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)


@router.put("/users/{target_employee_id}", response_model=UserOut)
async def admin_update_user(
	target_employee_id: str,
	payload: UserUpdateByAdmin,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	row = (
		await db.execute(select(User).options(selectinload(User.location)).where(User.employee_id == target_employee_id))
	).scalar_one_or_none()
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")

	if row.role == Role.ADMIN and row.id != user["user_id"]:
		raise HTTPException(status_code=403, detail="cannot modify another admin's data")

	before = _user_to_out(row).model_dump(mode="json")

	if payload.name is not None:
		row.name = payload.name
	if payload.sex is not None:
		row.sex = Sex[payload.sex]
	if payload.department_id is not None:
		row.department_id = payload.department_id
	if payload.role is not None:
		row.role = Role[payload.role]
	if payload.location is not None:
		location = (
			await db.scalars(
				select(OfficeLocation).where(OfficeLocation.name == payload.location)
			)
		).first()
		if location is None:
			raise HTTPException(status_code=400, detail="invalid location")
		row.location = location
	if payload.email is not None:
		row.email = payload.email
	if payload.password is not None:
		row.password = hash_password(payload.password)
	if payload.hire_date is not None:
		row.hire_date = payload.hire_date
	if payload.termination_date is not None:
		row.termination_date = payload.termination_date

	after = before.copy()
	if payload.name is not None:
		after["name"] = payload.name
	if payload.sex is not None:
		after["sex"] = payload.sex
	if payload.department_id is not None:
		after["department_id"] = payload.department_id
	if payload.location is not None:
		after["location"] = payload.location
	if payload.role is not None:
		after["role"] = payload.role
	if payload.email is not None:
		after["email"] = payload.email
	if payload.hire_date is not None:
		after["hire_date"] = payload.hire_date.isoformat()
	if payload.termination_date is not None:
		after["termination_date"] = payload.termination_date.isoformat()
	await log_action(
		db,
		user_id=user["user_id"],
		actor_name=user["name"],
		action=Action.UPDATE,
		target_type=TargetType.USER,
		target_id=row.id,
		target_name=f"{row.name} ({row.employee_id})",
		detail={"before": before, "after": after},
	)
	await db.commit()
	row = await _get_user_for_out(db, row.id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)


@router.delete("/users/{target_employee_id}", status_code=204)
async def admin_delete_user(
	target_employee_id: str,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> None:
	row = (
		await db.execute(select(User).options(selectinload(User.location)).where(User.employee_id == target_employee_id))
	).scalar_one_or_none()
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")

	if row.id == user["user_id"]:
		raise HTTPException(status_code=400, detail="cannot delete yourself")

	before = _user_to_out(row).model_dump(mode="json")
	target_name = f"{row.name} ({row.employee_id})"
	await db.delete(row)
	await log_action(
		db,
		user_id=user["user_id"],
		actor_name=user["name"],
		action=Action.DELETE,
		target_type=TargetType.USER,
		target_id=row.id,
		target_name=target_name,
		detail={"before": before},
	)
	try:
		await db.commit()
	except IntegrityError:
		await db.rollback()
		raise HTTPException(status_code=409, detail="cannot delete user with existing records") from None


# ── 離職流程 ──────────────────────────────────────────────

class OffboardingAssetItem(BaseModel):
	id: int
	asset_code: str
	name: str
	status: str


class OffboardingTicketItem(BaseModel):
	id: int
	description: str
	status: str
	has_loaner: bool


class OffboardingTransferItem(BaseModel):
	id: int
	asset_id: int
	asset_name: str | None
	asset_code: str | None


class OffboardingTransferStatus(BaseModel):
	transfer_id: int
	asset_id: int
	asset_code: str
	asset_name: str
	to_owner_name: str
	to_owner_employee_id: str
	status: str
	to_confirmed: bool


class OffboardingChecklist(BaseModel):
	can_proceed: bool
	hard_blocker_reason: str | None
	owned_assets: list[OffboardingAssetItem]
	borrowed_loaners: list[OffboardingAssetItem]
	in_progress_tickets: list[OffboardingTicketItem]
	pending_transfers: list[OffboardingTransferItem]
	open_tickets: list[OffboardingTicketItem]
	is_offboarding_in_progress: bool
	offboarding_transfers: list[OffboardingTransferStatus]
	all_transfers_complete: bool


class OffboardPayload(BaseModel):
	asset_successor_id: int | None = None
	termination_date: date


@router.get("/users/{target_employee_id}/offboarding-checklist", response_model=OffboardingChecklist)
async def get_offboarding_checklist(
	target_employee_id: str,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> OffboardingChecklist:
	row = (await db.execute(select(User).where(User.employee_id == target_employee_id))).scalar_one_or_none()
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	if row.id == user["user_id"]:
		raise HTTPException(status_code=400, detail="不能對自己發起離職流程")
	if not row.is_active:
		raise HTTPException(status_code=400, detail="此帳號已停用")

	# ── 離職進行中：回傳資產轉移進度 ────────────────────────────
	if row.termination_date is not None:
		ob_transfers = (await db.scalars(
			select(AssetTransfer).where(
				AssetTransfer.from_owner_id == row.id,
				AssetTransfer.is_offboarding_transfer.is_(True),
				AssetTransfer.status.in_(["PENDING", "COMPLETED"]),
			)
		)).all()
		statuses: list[OffboardingTransferStatus] = []
		for t in ob_transfers:
			asset = await db.get(Asset, t.asset_id)
			to_user = await db.get(User, t.to_owner_id)
			statuses.append(OffboardingTransferStatus(
				transfer_id=t.id,
				asset_id=t.asset_id,
				asset_code=asset.asset_code if asset else "—",
				asset_name=asset.name if asset else "—",
				to_owner_name=to_user.name if to_user else "—",
				to_owner_employee_id=to_user.employee_id if to_user else "—",
				status=t.status,
				to_confirmed=t.to_confirmed,
			))
		all_complete = all(t.status == "COMPLETED" for t in ob_transfers) if ob_transfers else True
		return OffboardingChecklist(
			can_proceed=True,
			hard_blocker_reason=None,
			owned_assets=[],
			borrowed_loaners=[],
			in_progress_tickets=[],
			pending_transfers=[],
			open_tickets=[],
			is_offboarding_in_progress=True,
			offboarding_transfers=statuses,
			all_transfers_complete=all_complete,
		)

	# ── 尚未發起：回傳一般清單 ───────────────────────────────────

	# 保管中的資產（非已停用）
	owned = (await db.scalars(
		select(Asset).where(Asset.owner_id == row.id, Asset.status != AssetStatus.DEACTIVATED)
	)).all()
	owned_items = [OffboardingAssetItem(id=a.id, asset_code=a.asset_code, name=a.name, status=a.status.value) for a in owned]

	# 借用中的備用機
	borrowed = (await db.scalars(select(Asset).where(Asset.borrower_id == row.id))).all()
	borrowed_items = [OffboardingAssetItem(id=a.id, asset_code=a.asset_code, name=a.name, status=a.status.value) for a in borrowed]

	# 其他待確認的資產轉移（非離職轉移）
	pending_transfers = (await db.scalars(
		select(AssetTransfer).where(
			AssetTransfer.status == "PENDING",
			AssetTransfer.is_offboarding_transfer.is_(False),
			(AssetTransfer.from_owner_id == row.id) | (AssetTransfer.to_owner_id == row.id),
		)
	)).all()
	transfer_items: list[OffboardingTransferItem] = []
	for t in pending_transfers:
		asset = await db.get(Asset, t.asset_id)
		transfer_items.append(OffboardingTransferItem(
			id=t.id,
			asset_id=t.asset_id,
			asset_name=asset.name if asset else None,
			asset_code=asset.asset_code if asset else None,
		))

	# 待審核 / 已退回的工單
	open_tickets = (await db.scalars(
		select(RepairRequest).where(
			RepairRequest.requester_id == row.id,
			RepairRequest.status.in_(["OPEN", "RETURNED"]),
		)
	)).all()
	ticket_items = [
		OffboardingTicketItem(id=t.id, description=t.description[:60], status=t.status, has_loaner=bool(t.loaner_asset_id))
		for t in open_tickets
	]

	# 進行中的維修工單（IN_PROGRESS 或 WAITING_LOANER_RETURN），離職時移交給接收管理員
	active_tickets = (await db.scalars(
		select(RepairRequest).where(
			RepairRequest.requester_id == row.id,
			RepairRequest.status.in_(["IN_PROGRESS", "WAITING_LOANER_RETURN"]),
		)
	)).all()
	active_ticket_items = [
		OffboardingTicketItem(id=t.id, description=t.description[:60], status=t.status, has_loaner=bool(t.loaner_asset_id))
		for t in active_tickets
	]

	return OffboardingChecklist(
		can_proceed=True,
		hard_blocker_reason=None,
		owned_assets=owned_items,
		borrowed_loaners=borrowed_items,
		in_progress_tickets=active_ticket_items,
		pending_transfers=transfer_items,
		open_tickets=ticket_items,
		is_offboarding_in_progress=False,
		offboarding_transfers=[],
		all_transfers_complete=False,
	)


@router.post("/users/{target_employee_id}/offboard", response_model=UserOut)
async def offboard_user(
	target_employee_id: str,
	payload: OffboardPayload,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	row = (
		await db.execute(select(User).options(selectinload(User.location)).where(User.employee_id == target_employee_id))
	).scalar_one_or_none()
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	if row.id == user["user_id"]:
		raise HTTPException(status_code=400, detail="不能對自己發起離職流程")
	if not row.is_active:
		raise HTTPException(status_code=400, detail="此帳號已停用")
	if row.termination_date is not None:
		raise HTTPException(status_code=400, detail="此使用者的離職流程已在進行中，請等待接收人確認所有資產轉移後再完成離職")

	# 最後一個 active admin 不能被停用
	if row.role == Role.ADMIN:
		active_admin_count = (await db.execute(
			select(User).where(User.role == Role.ADMIN, User.is_active.is_(True))
		)).scalars().all()
		if len(active_admin_count) <= 1:
			raise HTTPException(status_code=400, detail="系統中至少需要一名有效的管理員帳號")

	# 保管中的資產
	owned = (await db.scalars(
		select(Asset).where(Asset.owner_id == row.id, Asset.status != AssetStatus.DEACTIVATED)
	)).all()

	# 進行中的維修工單（IN_PROGRESS 或 WAITING_LOANER_RETURN），將移交給接收管理員
	active_tickets = (await db.scalars(
		select(RepairRequest).where(
			RepairRequest.requester_id == row.id,
			RepairRequest.status.in_(["IN_PROGRESS", "WAITING_LOANER_RETURN"]),
		)
	)).all()

	# 借用中的備用機，將移交給接收管理員
	borrowed_loaners = (await db.scalars(select(Asset).where(Asset.borrower_id == row.id))).all()

	if (owned or active_tickets or borrowed_loaners) and payload.asset_successor_id is None:
		raise HTTPException(status_code=422, detail="此使用者有保管資產或進行中的維修工單需要接收，請指定接收管理員")

	successor: User | None = None
	if payload.asset_successor_id is not None:
		successor = await db.get(User, payload.asset_successor_id)
		if successor is None:
			raise HTTPException(status_code=404, detail="接收人不存在")
		if not successor.is_active:
			raise HTTPException(status_code=400, detail="指定的接收人帳號已停用")

	offboard_label = f"{row.name}（{row.employee_id}）"

	# 1. 取消尚未完成的待確認轉移
	pending_transfers = (await db.scalars(
		select(AssetTransfer).where(
			AssetTransfer.status == "PENDING",
			(AssetTransfer.from_owner_id == row.id) | (AssetTransfer.to_owner_id == row.id),
		)
	)).all()
	for t in pending_transfers:
		t.status = "CANCELLED"

	# 2. 為每個保管資產發起待確認轉移；管理員代離職員工確認 from 方，接收人須自行確認 to 方
	for asset in owned:
		transfer = AssetTransfer(
			asset_id=asset.id,
			initiator_id=user["user_id"],
			from_owner_id=asset.owner_id,
			to_owner_id=payload.asset_successor_id,
			status="PENDING",
			from_confirmed=True,
			to_confirmed=False,
			is_offboarding_transfer=True,
		)
		db.add(transfer)

	# 3. 將進行中的維修工單（IN_PROGRESS / WAITING_LOANER_RETURN）移交給接收管理員
	for ticket in active_tickets:
		ticket.requester_id = successor.id
		ticket.version += 1

	# 4. 將備用機借用人更新為接收管理員，確保後續歸還確認由接收管理員完成
	for loaner in borrowed_loaners:
		loaner.borrower_id = successor.id
		loaner.version += 1

	# 5. 取消待審核 / 已退回的工單，寫入離職原因
	open_tickets = (await db.scalars(
		select(RepairRequest).where(
			RepairRequest.requester_id == row.id,
			RepairRequest.status.in_(["OPEN", "RETURNED"]),
		)
	)).all()
	for ticket in open_tickets:
		ticket.status = "CANCELLED"
		ticket.reject_reason = f"員工離職：{offboard_label}"
		ticket.version += 1

	# 6. 設定離職日；有資產或工單待移交時先保持 is_active=True
	row.termination_date = payload.termination_date
	needs_pending = bool(owned) or bool(active_tickets) or bool(borrowed_loaners)
	if not needs_pending:
		row.is_active = False

	await log_action(
		db,
		user_id=user["user_id"],
		actor_name=user["name"],
		action=Action.UPDATE,
		target_type=TargetType.USER,
		target_id=row.id,
		target_name=offboard_label,
		detail={
			"action": "offboard",
			"asset_successor_id": payload.asset_successor_id,
			"termination_date": payload.termination_date.isoformat(),
			"assets_pending_transfer": len(owned),
			"tickets_transferred": len(active_tickets),
			"loaners_transferred": len(borrowed_loaners),
			"tickets_cancelled": len(open_tickets),
		},
	)

	await db.commit()
	row = await _get_user_for_out(db, row.id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)


@router.post("/users/{target_employee_id}/offboard/finalize", response_model=UserOut)
async def finalize_offboarding(
	target_employee_id: str,
	user=Depends(admin_required),
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	row = (
		await db.execute(select(User).options(selectinload(User.location)).where(User.employee_id == target_employee_id))
	).scalar_one_or_none()
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	if not row.is_active:
		raise HTTPException(status_code=400, detail="此帳號已停用")
	if row.termination_date is None:
		raise HTTPException(status_code=400, detail="尚未發起離職流程")

	pending = (await db.scalars(
		select(AssetTransfer).where(
			AssetTransfer.from_owner_id == row.id,
			AssetTransfer.is_offboarding_transfer.is_(True),
			AssetTransfer.status == "PENDING",
		)
	)).all()
	if pending:
		raise HTTPException(
			status_code=409,
			detail=f"仍有 {len(pending)} 筆資產轉移待接收人確認，請確認所有資產後再完成離職",
		)

	row.is_active = False
	offboard_label = f"{row.name}（{row.employee_id}）"
	await log_action(
		db,
		user_id=user["user_id"],
		actor_name=user["name"],
		action=Action.UPDATE,
		target_type=TargetType.USER,
		target_id=row.id,
		target_name=offboard_label,
		detail={"action": "offboard_finalize", "termination_date": row.termination_date.isoformat()},
	)
	await db.commit()
	row = await _get_user_for_out(db, row.id)
	if row is None:
		raise HTTPException(status_code=404, detail="user not found")
	return _user_to_out(row)
