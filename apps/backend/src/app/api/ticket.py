from datetime import date, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.api.deps import get_current_user, require_role
from app.core.audit import log_action
from app.core.cache import redis
from app.core.db import get_db
from app.core.email import send_email
from app.core.limiter import limiter
from app.core.storage import storage
from app.models import Attachment, RepairInspection, RepairRecord, RepairRequest, User, Vendor
from app.models.asset import Asset, AssetStatus
from app.models.audit_log import Action, TargetType
from app.models.user import Role

admin_required = require_role("ADMIN")

router = APIRouter()
CACHE_TTL_SECONDS = 60
MAX_ATTACHMENT_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_ACTIVE_STATUSES = ("OPEN", "IN_PROGRESS", "WAITING_LOANER_RETURN")


def _ticket_cache_key(ticket_id: int) -> str:
    return f"ticket:{ticket_id}"


def _ensure_ticket_version(row: RepairRequest, version: int | None) -> None:
    if version is not None and row.version != version:
        raise HTTPException(
            status_code=409,
            detail="該工單已被其他使用者修改，請重新整理後再試 (Ticket has been modified by another user)",
        )


class RepairRequestCreate(BaseModel):
    asset_id: int
    requester_id: int
    description: str
    need_backup: bool = False
    backup_spec: str | None = None
    expected_completion_date: date | None = None
    pickup_location: str | None = None


class RepairRequestStatusUpdate(BaseModel):
    status: Literal["OPEN", "IN_PROGRESS", "DONE", "CANCELLED", "RETURNED", "WAITING_LOANER_RETURN"]
    version: int | None = None
    expected_completion_date: date | None = None
    reject_reason: str | None = None
    loaner_asset_id: int | None = None  # 核准時指定備用機


class TicketVersionPayload(BaseModel):
    version: int | None = None


class CloseTicketPayload(BaseModel):
    version: int | None = None
    issue_description: str
    solution: str
    vendor_id: int
    cost: int = 0


class RepairRequestUpdate(BaseModel):
    asset_id: int
    requester_id: int
    description: str
    version: int | None = None
    need_backup: bool = False
    backup_spec: str | None = None
    status: Literal["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] = "OPEN"
    expected_completion_date: date | None = None
    pickup_location: str | None = None


class RepairRequestOut(BaseModel):
    id: int
    asset_id: int
    requester_id: int
    description: str
    need_backup: bool
    backup_spec: str | None
    status: str
    reject_reason: str | None = None
    expected_completion_date: date | None
    pickup_location: str | None
    loaner_asset_id: int | None = None
    loaner_asset_code: str | None = None
    loaner_asset_name: str | None = None
    loaner_return_borrower_confirmed: bool = False
    loaner_return_lender_confirmed: bool = False
    handled_by: int | None = None
    handled_by_name: str | None = None
    created_at: datetime
    version: int
    requester_name: str | None = None


class RepairInspectionCreate(BaseModel):
    status: bool
    note: str | None = None
    checked_by: int


class RepairInspectionOut(BaseModel):
    id: int
    request_id: int
    status: bool
    note: str | None
    checked_by: int
    checked_at: datetime


class RepairRecordCreate(BaseModel):
    repair_date: date
    issue_description: str
    solution: str
    cost: int = 0
    vendor_id: int


class RepairInspectionUpdate(BaseModel):
    status: bool
    note: str | None = None
    checked_by: int


class RepairRecordUpdate(BaseModel):
    repair_date: date
    issue_description: str
    solution: str
    cost: int = 0
    vendor_id: int


class RepairRecordOut(BaseModel):
    id: int
    request_id: int
    repair_date: date
    issue_description: str
    solution: str
    cost: int
    vendor: str | None
    vendor_id: int | None
    created_at: datetime


AttachmentAttachableType = Literal["REPAIR_REQUEST", "REPAIR_INSPECTION", "REPAIR_RECORD"]
AttachmentFileType = Literal["IMAGE"]


# class AttachmentCreate(BaseModel):
#     attachable_type: AttachmentAttachableType
#     attachable_id: int
#     file_url: str
#     file_type: AttachmentFileType
#     file_name: str


class AttachmentUpdate(BaseModel):
    file_url: str
    file_type: AttachmentFileType
    file_name: str


class AttachmentOut(BaseModel):
    id: int
    attachable_type: AttachmentAttachableType
    attachable_id: int
    file_url: str
    file_type: AttachmentFileType
    file_name: str
    created_at: datetime


class RepairRequestWithAttachments(BaseModel):
    request: RepairRequestOut
    # 每個 repair request 只會對應到一個 attachment
    attachment: AttachmentOut | None


def _request_to_out(
    row: RepairRequest,
    requester_name: str | None = None,
    loaner_asset: Asset | None = None,
    handler_name: str | None = None,
) -> RepairRequestOut:
    return RepairRequestOut(
        id=row.id,
        asset_id=row.asset_id,
        requester_id=row.requester_id,
        description=row.description,
        need_backup=row.need_backup,
        backup_spec=row.backup_spec,
        status=row.status,
        reject_reason=row.reject_reason,
        expected_completion_date=row.expected_completion_date,
        pickup_location=row.pickup_location,
        loaner_asset_id=row.loaner_asset_id,
        loaner_asset_code=loaner_asset.asset_code if loaner_asset else None,
        loaner_asset_name=loaner_asset.name if loaner_asset else None,
        loaner_return_borrower_confirmed=row.loaner_return_borrower_confirmed,
        loaner_return_lender_confirmed=row.loaner_return_lender_confirmed,
        handled_by=row.handled_by,
        handled_by_name=handler_name,
        created_at=row.created_at,
        version=row.version,
        requester_name=requester_name,
    )


async def _require_handler(row: RepairRequest, user: dict, db: AsyncSession) -> None:
    """僅允許負責此工單的管理員執行後續操作。若 handled_by 為 NULL（舊資料），任何管理員皆可操作。"""
    if row.handled_by is not None and row.handled_by != user["user_id"]:
        handler = await db.get(User, row.handled_by)
        handler_name = handler.name if handler else f"#{row.handled_by}"
        raise HTTPException(status_code=403, detail=f"此工單由管理員 {handler_name} 負責，無法操作")


def _inspection_to_out(row: RepairInspection) -> RepairInspectionOut:
    return RepairInspectionOut(
        id=row.id,
        request_id=row.request_id,
        status=row.status,
        note=row.note,
        checked_by=row.checked_by,
        checked_at=row.checked_at,
    )


def _record_to_out(row: RepairRecord, vendor_name: str | None = None) -> RepairRecordOut:
    return RepairRecordOut(
        id=row.id,
        request_id=row.request_id,
        repair_date=row.repair_date,
        issue_description=row.issue_description,
        solution=row.solution,
        cost=row.cost,
        vendor=vendor_name,
        vendor_id=row.vendor_id,
        created_at=row.created_at,
    )


def _attachment_to_out(row: Attachment) -> AttachmentOut:
    file_url = row.file_url
    if not (file_url.startswith("http://") or file_url.startswith("https://")):
        file_url = storage.get_url(file_url)

    return AttachmentOut(
        id=row.id,
        attachable_type=row.attachable_type,
        attachable_id=row.attachable_id,
        file_url=file_url,
        file_type=row.file_type,
        file_name=row.file_name,
        created_at=row.created_at,
    )


def _is_remote_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def _safe_filename(raw_name: str | None) -> str:
    name = Path(raw_name or "image").name.strip()
    return name or "image"


async def _ensure_attachable_exists(
    db: AsyncSession,
    attachable_type: AttachmentAttachableType,
    attachable_id: int,
) -> None:
    if attachable_type == "REPAIR_REQUEST":
        row = await db.get(RepairRequest, attachable_id)
    elif attachable_type == "REPAIR_INSPECTION":
        row = await db.get(RepairInspection, attachable_id)
    else:
        row = await db.get(RepairRecord, attachable_id)

    if row is None:
        raise HTTPException(status_code=404, detail="attachable target not found")


async def _extract_attachment_owner(db: AsyncSession, row: Attachment, user: dict) -> int:
    if row.attachable_type == "REPAIR_REQUEST":
        attachable_row = await db.get(RepairRequest, row.attachable_id)
        if attachable_row is None:
            raise HTTPException(status_code=404, detail="attachable target not found")
        return attachable_row.requester_id

    if row.attachable_type == "REPAIR_INSPECTION":
        attachable_row = await db.get(RepairInspection, row.attachable_id)
        if attachable_row is None:
            raise HTTPException(status_code=404, detail="attachable target not found")
        return attachable_row.checked_by

    raise HTTPException(status_code=422, detail="unsupported attachable type")


@router.get("/tickets", response_model=list[RepairRequestOut])
async def list_tickets(db: AsyncSession = Depends(get_db), user=Depends(admin_required)) -> list[RepairRequestOut]:
    rows = (await db.scalars(select(RepairRequest).order_by(RepairRequest.id.desc()))).all()
    loaner_ids = {r.loaner_asset_id for r in rows if r.loaner_asset_id}
    loaner_map: dict[int, Asset] = {}
    if loaner_ids:
        loaners = (await db.scalars(select(Asset).where(Asset.id.in_(loaner_ids)))).all()
        loaner_map = {a.id: a for a in loaners}
    handler_ids = {r.handled_by for r in rows if r.handled_by}
    handler_map: dict[int, User] = {}
    if handler_ids:
        handlers = (await db.scalars(select(User).where(User.id.in_(handler_ids)))).all()
        handler_map = {u.id: u for u in handlers}
    return [
        _request_to_out(
            r,
            loaner_asset=loaner_map.get(r.loaner_asset_id) if r.loaner_asset_id else None,
            handler_name=handler_map[r.handled_by].name if r.handled_by and r.handled_by in handler_map else None,
        )
        for r in rows
    ]


@router.get("/assets/{asset_id}/tickets", response_model=list[RepairRequestWithAttachments])
async def list_asset_tickets(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[RepairRequestWithAttachments]:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    if user.get("role") != "ADMIN" and asset.owner_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    rows = (await db.scalars(
        select(RepairRequest)
        .where(RepairRequest.asset_id == asset_id)
        .order_by(RepairRequest.created_at.desc())
    )).all()

    request_ids = [r.id for r in rows]
    attachments_map: dict[int, AttachmentOut] = {}
    if request_ids:
        att_rows = (await db.scalars(
            select(Attachment)
            .where(
                Attachment.attachable_type == "REPAIR_REQUEST",
                Attachment.attachable_id.in_(request_ids),
            )
            .order_by(Attachment.id.desc())
        )).all()
        for a in att_rows:
            attachments_map.setdefault(a.attachable_id, _attachment_to_out(a))

    requester_ids = {r.requester_id for r in rows}
    requester_map: dict[int, User] = {}
    if requester_ids:
        requesters = (await db.scalars(select(User).where(User.id.in_(requester_ids)))).all()
        requester_map = {u.id: u for u in requesters}

    loaner_ids = {r.loaner_asset_id for r in rows if r.loaner_asset_id}
    loaner_map: dict[int, Asset] = {}
    if loaner_ids:
        loaners = (await db.scalars(select(Asset).where(Asset.id.in_(loaner_ids)))).all()
        loaner_map = {a.id: a for a in loaners}

    handler_ids = {r.handled_by for r in rows if r.handled_by}
    handler_map: dict[int, User] = {}
    if handler_ids:
        handlers = (await db.scalars(select(User).where(User.id.in_(handler_ids)))).all()
        handler_map = {u.id: u for u in handlers}

    result = []
    for r in rows:
        requester = requester_map.get(r.requester_id)
        result.append(RepairRequestWithAttachments(
            request=_request_to_out(
                r,
                requester_name=requester.name if requester else None,
                loaner_asset=loaner_map.get(r.loaner_asset_id) if r.loaner_asset_id else None,
                handler_name=handler_map[r.handled_by].name if r.handled_by and r.handled_by in handler_map else None,
            ),
            attachment=attachments_map.get(r.id),
        ))
    return result


@router.get("/tickets/list/{employee_id}", response_model=list[RepairRequestWithAttachments])
async def list_user_tickets(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[RepairRequestWithAttachments]:
    if user.get("role") != "ADMIN" and employee_id != user.get("employee_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    # 找employee_id對應的user_id，前提是employee_id不會重複
    requester_row = (await db.execute(select(User).where(User.employee_id == employee_id))).scalar_one_or_none()
    if requester_row is None:
        raise HTTPException(status_code=404, detail="user not found")

    requester_user_id = requester_row.id
    requester_name = requester_row.name

    rows = (
        await db.scalars(
            select(RepairRequest)
            .where(RepairRequest.requester_id == requester_user_id)
            .order_by(RepairRequest.id.desc())
        )
    ).all()

    # fetch attachments for all found requests
    request_ids = [r.id for r in rows]
    attachments_rows: list[Attachment] = []
    if request_ids:
        attachments_rows = (
            await db.scalars(
                select(Attachment)
                .where(
                    Attachment.attachable_type == "REPAIR_REQUEST",
                    Attachment.attachable_id.in_(request_ids),
                )
                .order_by(Attachment.id.desc())
            )
        ).all()

    # map to single attachment per request (take the latest if multiple exist)
    attachments_map: dict[int, AttachmentOut] = {}
    for a in attachments_rows:
        attachments_map.setdefault(a.attachable_id, _attachment_to_out(a))

    loaner_ids = {r.loaner_asset_id for r in rows if r.loaner_asset_id}
    loaner_map: dict[int, Asset] = {}
    if loaner_ids:
        loaners = (await db.scalars(select(Asset).where(Asset.id.in_(loaner_ids)))).all()
        loaner_map = {a.id: a for a in loaners}

    handler_ids = {r.handled_by for r in rows if r.handled_by}
    handler_map: dict[int, User] = {}
    if handler_ids:
        handlers = (await db.scalars(select(User).where(User.id.in_(handler_ids)))).all()
        handler_map = {u.id: u for u in handlers}

    result: list[RepairRequestWithAttachments] = []
    for r in rows:
        result.append(RepairRequestWithAttachments(
            request=_request_to_out(
                r,
                requester_name=requester_name,
                loaner_asset=loaner_map.get(r.loaner_asset_id) if r.loaner_asset_id else None,
                handler_name=handler_map[r.handled_by].name if r.handled_by and r.handled_by in handler_map else None,
            ),
            attachment=attachments_map.get(r.id),
        ))

    return result


@router.get("/tickets/{ticket_id}", response_model=RepairRequestOut)
async def get_ticket(
    ticket_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> RepairRequestOut:
    cache_key = _ticket_cache_key(ticket_id)
    cached = await redis.get(cache_key)
    if cached:
        request_row = RepairRequestOut.model_validate_json(cached)
        # 權限判斷：ADMIN 可讀取所有表單，USER 只能讀取自己的表單
        if user.get("role") != "ADMIN" and request_row.requester_id != user.get("user_id"):
            raise HTTPException(status_code=403, detail="Forbidden")
        if request_row.requester_name is None:
            requester = await db.get(User, request_row.requester_id)
            request_row.requester_name = requester.name if requester else None
        return request_row

    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    # 權限判斷：ADMIN 可讀取所有表單，USER 只能讀取自己的表單
    if user.get("role") != "ADMIN" and row.requester_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    requester = await db.get(User, row.requester_id)
    loaner_asset = await db.get(Asset, row.loaner_asset_id) if row.loaner_asset_id else None
    handler = await db.get(User, row.handled_by) if row.handled_by else None
    result = _request_to_out(
        row,
        requester_name=requester.name if requester else None,
        loaner_asset=loaner_asset,
        handler_name=handler.name if handler else None,
    )
    await redis.setex(cache_key, CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.post("/tickets", response_model=RepairRequestOut, status_code=201)
async def create_ticket(
    payload: RepairRequestCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> RepairRequestOut:
    asset_row = await db.get(Asset, payload.asset_id)
    if asset_row is None:
        raise HTTPException(status_code=404, detail="asset not found")

    if user.get("role") == "ADMIN" and asset_row.owner_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="管理員只能對自己保管的資產提出維修申請")

    existing_active = (await db.scalars(
        select(RepairRequest).where(
            RepairRequest.asset_id == payload.asset_id,
            RepairRequest.status.in_(_ACTIVE_STATUSES),
        )
    )).first()
    if existing_active:
        raise HTTPException(status_code=400, detail="此資產已有進行中的維修工單，請等待完成後再重新申請")

    row = RepairRequest(
        asset_id=payload.asset_id,
        requester_id=payload.requester_id,
        description=payload.description,
        need_backup=payload.need_backup,
        backup_spec=payload.backup_spec,
        expected_completion_date=payload.expected_completion_date,
        pickup_location=payload.pickup_location,
    )
    db.add(row)
    await db.flush()
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.CREATE,
        target_type=TargetType.TICKET,
        target_id=row.id,
        target_name=f"#{str(row.id).zfill(4)}",
        detail={"after": payload.model_dump(mode="json")},
    )
    await db.commit()
    await db.refresh(row)

    result = _request_to_out(row)
    await redis.setex(_ticket_cache_key(result.id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.put("/tickets/{ticket_id}", response_model=RepairRequestOut)
async def update_ticket(
    ticket_id: int, payload: RepairRequestUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> RepairRequestOut:
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    # 權限判斷：只能修改自己的表單
    if row.requester_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    _ensure_ticket_version(row, payload.version)

    # 只有 OPEN 或 RETURNED 工單可由申請人修改
    if row.status not in ("OPEN", "RETURNED"):
        raise HTTPException(status_code=400, detail="只有待審核（OPEN）或已退回（RETURNED）狀態的工單才能修改")

    before = _request_to_out(row).model_dump(mode="json")

    row.asset_id = payload.asset_id
    row.requester_id = payload.requester_id
    row.description = payload.description
    row.need_backup = payload.need_backup
    row.backup_spec = payload.backup_spec
    row.expected_completion_date = payload.expected_completion_date
    row.pickup_location = payload.pickup_location
    # RETURNED 工單重新提交時強制重置為 OPEN，並清除退回原因
    if row.status == "RETURNED":
        row.status = "OPEN"
        row.reject_reason = None
    else:
        row.status = payload.status
    row.version += 1

    after = _request_to_out(row).model_dump(mode="json")
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.TICKET,
        target_id=ticket_id,
        target_name=f"#{str(ticket_id).zfill(4)}",
        detail={"before": before, "after": after},
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="該工單已被其他使用者修改，請重新整理後再試 (Ticket has been modified by another user)",
        )
    await db.refresh(row)

    loaner_asset = await db.get(Asset, row.loaner_asset_id) if row.loaner_asset_id else None
    result = _request_to_out(row, loaner_asset=loaner_asset)
    await redis.setex(_ticket_cache_key(ticket_id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.patch("/tickets/{ticket_id}/status", response_model=RepairRequestOut)
async def update_ticket_status(
    ticket_id: int,
    payload: RepairRequestStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> RepairRequestOut:
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    _ensure_ticket_version(row, payload.version)

    # 只有 OPEN 工單可由任意管理員審核；非 OPEN 工單只有 handled_by 管理員可操作
    if row.status != "OPEN":
        await _require_handler(row, user, db)

    old_status = row.status

    # 審核動作（OPEN → IN_PROGRESS 或 OPEN → RETURNED）記錄負責管理員
    if row.status == "OPEN" and payload.status in ("IN_PROGRESS", "RETURNED"):
        row.handled_by = user["user_id"]

    row.status = payload.status
    row.version += 1

    # 同步資產狀態
    asset_row = await db.get(Asset, row.asset_id)
    if asset_row is not None:
        if payload.status == "IN_PROGRESS":
            asset_row.status = AssetStatus.MAINTENANCE
            asset_row.version += 1
            if payload.expected_completion_date:
                row.expected_completion_date = payload.expected_completion_date
            # 指定備用機：將備用機設為已借出，並記錄借用人
            if row.need_backup and payload.loaner_asset_id:
                loaner = await db.get(Asset, payload.loaner_asset_id)
                if loaner is None:
                    raise HTTPException(status_code=404, detail="備用機資產不存在")
                if loaner.status != AssetStatus.AVAILABLE:
                    raise HTTPException(status_code=400, detail="備用機目前不可借用（非閒置狀態）")
                if loaner.owner_id != user["user_id"]:
                    raise HTTPException(status_code=403, detail="只能借出自己保管的閒置資產")
                loaner.status = AssetStatus.BORROWED
                loaner.borrower_id = row.requester_id
                loaner.version += 1
                row.loaner_asset_id = payload.loaner_asset_id
        elif payload.status in ("DONE", "CANCELLED"):
            # 若保管人為管理員則設閒置，否則設使用中
            owner = await db.get(User, asset_row.owner_id) if asset_row.owner_id else None
            is_admin_owner = owner and owner.role == Role.ADMIN
            asset_row.status = AssetStatus.AVAILABLE if (is_admin_owner or not asset_row.owner_id) else AssetStatus.IN_USE
            asset_row.version += 1

    if payload.status == "RETURNED":
        row.reject_reason = payload.reject_reason

    requester = await db.get(User, row.requester_id)

    # Email 通知
    if requester:
        asset_label = f"{asset_row.name}（{asset_row.asset_code}）" if asset_row else f"資產 #{row.asset_id}"
        if payload.status == "IN_PROGRESS":
            backup_note = "，<b>備用機已備妥，請至服務台領取</b>" if row.need_backup else ""
            send_email(
                subject=f"【維修申請核准】{asset_label} 維修工單已核准",
                body=f"<p>您好 {requester.name}，</p><p>您的維修申請（工單 #{ticket_id}）已核准。</p><p>請繳回資產 <b>{asset_label}</b>{backup_note}。</p><p>預計完成時間：{payload.expected_completion_date or '待定'}</p>",
                receiver=requester.email,
            )
        elif payload.status == "RETURNED":
            send_email(
                subject=f"【維修申請退回】{asset_label} 維修工單已退回",
                body=f"<p>您好 {requester.name}，</p><p>您的維修申請（工單 #{ticket_id}）已被退回。</p><p>退回原因：{payload.reject_reason or '無說明'}</p><p>如有需要，請重新開立新的維修申請。</p>",
                receiver=requester.email,
            )

    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.TICKET,
        target_id=ticket_id,
        target_name=f"#{str(ticket_id).zfill(4)}",
        detail={"before": {"status": old_status}, "after": {"status": payload.status}},
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="該工單已被其他使用者修改，請重新整理後再試 (Ticket has been modified by another user)",
        )
    await db.refresh(row)

    loaner_asset = await db.get(Asset, row.loaner_asset_id) if row.loaner_asset_id else None
    handler = await db.get(User, row.handled_by) if row.handled_by else None
    result = _request_to_out(
        row,
        requester_name=requester.name if requester else None,
        loaner_asset=loaner_asset,
        handler_name=handler.name if handler else None,
    )
    await redis.setex(_ticket_cache_key(ticket_id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.post("/tickets/{ticket_id}/close", response_model=RepairRequestOut)
async def close_ticket(
    ticket_id: int,
    payload: CloseTicketPayload,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> RepairRequestOut:
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    _ensure_ticket_version(row, payload.version)
    if row.status != "IN_PROGRESS":
        raise HTTPException(status_code=400, detail="只有「維修中」的工單才能結案")
    await _require_handler(row, user, db)

    vendor = await db.get(Vendor, payload.vendor_id)
    if vendor is None:
        raise HTTPException(status_code=400, detail="vendor not found")

    # 建立或更新維修紀錄
    existing_record = (await db.scalars(
        select(RepairRecord).where(RepairRecord.request_id == ticket_id)
    )).first()
    if existing_record:
        existing_record.issue_description = payload.issue_description
        existing_record.solution = payload.solution
        existing_record.vendor_id = vendor.id
        existing_record.cost = payload.cost
        existing_record.repair_date = date.today()
    else:
        record = RepairRecord(
            request_id=ticket_id,
            repair_date=date.today(),
            issue_description=payload.issue_description,
            solution=payload.solution,
            cost=payload.cost,
            vendor_id=vendor.id,
        )
        db.add(record)

    asset_row = await db.get(Asset, row.asset_id)
    requester = await db.get(User, row.requester_id)

    # 若有備用機借出，切換至等待歸還狀態；否則直接結案
    has_loaner = bool(row.loaner_asset_id)
    if has_loaner:
        row.status = "WAITING_LOANER_RETURN"
        new_status = "WAITING_LOANER_RETURN"
    else:
        row.status = "DONE"
        new_status = "DONE"
        # 更新資產狀態（管理員保管人 → 閒置，員工保管人 → 使用中）
        if asset_row:
            owner = await db.get(User, asset_row.owner_id) if asset_row.owner_id else None
            is_admin_owner = owner and owner.role == Role.ADMIN
            asset_row.status = AssetStatus.AVAILABLE if (is_admin_owner or not asset_row.owner_id) else AssetStatus.IN_USE
            asset_row.version += 1

    row.version += 1

    if requester and asset_row:
        asset_label = f"{asset_row.name}（{asset_row.asset_code}）"
        backup_note = "，<b>請繳回備用機以完成結案</b>" if has_loaner else ""
        send_email(
            subject=f"【維修完成】{asset_label} 維修已結案",
            body=f"<p>您好 {requester.name}，</p><p>您的資產 <b>{asset_label}</b> 維修已完成，請前往領取{backup_note}。</p><p>維修摘要：{payload.solution}</p>",
            receiver=requester.email,
        )

    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.TICKET,
        target_id=ticket_id,
        target_name=f"#{str(ticket_id).zfill(4)}",
        detail={"before": {"status": "IN_PROGRESS"}, "after": {"status": new_status}},
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="該工單已被其他使用者修改，請重新整理後再試 (Ticket has been modified by another user)",
        )
    await db.refresh(row)

    loaner_asset = await db.get(Asset, row.loaner_asset_id) if row.loaner_asset_id else None
    handler = await db.get(User, row.handled_by) if row.handled_by else None
    result = _request_to_out(
        row,
        requester_name=requester.name if requester else None,
        loaner_asset=loaner_asset,
        handler_name=handler.name if handler else None,
    )
    await redis.setex(_ticket_cache_key(ticket_id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.post("/tickets/{ticket_id}/confirm-loaner-return", response_model=RepairRequestOut)
async def confirm_loaner_return(
    ticket_id: int,
    payload: TicketVersionPayload | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> RepairRequestOut:
    """雙方確認備用機歸還：出借方（loaner 保管人）和借用方（申請人）各自確認一次。"""
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    _ensure_ticket_version(row, payload.version if payload else None)
    if row.status != "WAITING_LOANER_RETURN":
        raise HTTPException(status_code=400, detail="此工單目前不在等待備用機歸還狀態")
    if not row.loaner_asset_id:
        raise HTTPException(status_code=400, detail="此工單無備用機紀錄")

    loaner = await db.get(Asset, row.loaner_asset_id)
    if loaner is None:
        raise HTTPException(status_code=404, detail="備用機資產不存在")

    my_id = user["user_id"]
    is_lender = loaner.owner_id == my_id   # 出借方：loaner 保管人
    is_borrower = row.requester_id == my_id  # 借用方：維修申請人

    if not is_lender and not is_borrower:
        raise HTTPException(status_code=403, detail="Forbidden")

    if is_lender:
        row.loaner_return_lender_confirmed = True
    if is_borrower:
        row.loaner_return_borrower_confirmed = True

    # 雙方均確認 → 完成歸還
    if row.loaner_return_lender_confirmed and row.loaner_return_borrower_confirmed:
        loaner.status = AssetStatus.AVAILABLE
        loaner.borrower_id = None
        loaner.version += 1

        asset_row = await db.get(Asset, row.asset_id)
        if asset_row:
            owner = await db.get(User, asset_row.owner_id) if asset_row.owner_id else None
            is_admin_owner = owner and owner.role == Role.ADMIN
            asset_row.status = AssetStatus.AVAILABLE if (is_admin_owner or not asset_row.owner_id) else AssetStatus.IN_USE
            asset_row.version += 1

        row.status = "DONE"

    row.version += 1

    await log_action(
        db,
        user_id=my_id,
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.TICKET,
        target_id=ticket_id,
        target_name=f"#{str(ticket_id).zfill(4)}",
        detail={"after": {
            "loaner_return_lender_confirmed": row.loaner_return_lender_confirmed,
            "loaner_return_borrower_confirmed": row.loaner_return_borrower_confirmed,
            "loaner_asset_id": row.loaner_asset_id,
        }},
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="該工單已被其他使用者修改，請重新整理後再試 (Ticket has been modified by another user)",
        )
    await db.refresh(row)

    requester = await db.get(User, row.requester_id)
    result = _request_to_out(row, requester_name=requester.name if requester else None, loaner_asset=loaner)
    await redis.setex(_ticket_cache_key(ticket_id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.delete("/tickets/{ticket_id}", status_code=204)
async def delete_ticket(ticket_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)) -> None:
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    # 權限判斷：只能刪除自己的表單
    if row.requester_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    before = _request_to_out(row).model_dump(mode="json")
    await db.delete(row)
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.DELETE,
        target_type=TargetType.TICKET,
        target_id=ticket_id,
        target_name=f"#{str(ticket_id).zfill(4)}",
        detail={"before": before},
    )
    await db.commit()
    await redis.delete(_ticket_cache_key(ticket_id))


@router.get("/tickets/{ticket_id}/inspection", response_model=RepairInspectionOut)
async def get_ticket_inspection(
    ticket_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> RepairInspectionOut:
    request_row = await db.get(RepairRequest, ticket_id)
    if request_row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    # 權限判斷：ADMIN 可讀取所有，USER 只能讀取自己的票單
    if user.get("role") != "ADMIN" and request_row.requester_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    row = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="inspection not found")
    return _inspection_to_out(row)


@router.post("/tickets/{ticket_id}/inspection", response_model=RepairInspectionOut, status_code=201)
async def create_ticket_inspection(
    ticket_id: int, payload: RepairInspectionCreate, db: AsyncSession = Depends(get_db), user=Depends(admin_required)
) -> RepairInspectionOut:
    request_row = await db.get(RepairRequest, ticket_id)
    if request_row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    await _require_handler(request_row, user, db)

    existing = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="inspection already exists")

    row = RepairInspection(
        request_id=ticket_id,
        status=payload.status,
        note=payload.note,
        checked_by=user["user_id"],
    )
    db.add(row)
    await db.flush()
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.CREATE,
        target_type=TargetType.INSPECTION,
        target_id=row.id,
        target_name=f"驗收單 #{row.id} (報修單 #{ticket_id})",
        detail={"after": payload.model_dump(mode="json")},
    )
    await db.commit()
    await db.refresh(row)
    return _inspection_to_out(row)


@router.put("/tickets/{ticket_id}/inspection", response_model=RepairInspectionOut)
async def update_ticket_inspection(
    ticket_id: int, payload: RepairInspectionUpdate, db: AsyncSession = Depends(get_db), user=Depends(admin_required)
) -> RepairInspectionOut:
    row = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="inspection not found")

    request_row = await db.get(RepairRequest, ticket_id)
    if request_row:
        await _require_handler(request_row, user, db)

    before = _inspection_to_out(row).model_dump(mode="json")

    row.status = payload.status
    row.note = payload.note
    row.checked_by = user["user_id"]

    after = _inspection_to_out(row).model_dump(mode="json")
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.INSPECTION,
        target_id=row.id,
        target_name=f"驗收單 #{row.id} (報修單 #{ticket_id})",
        detail={"before": before, "after": after},
    )
    await db.commit()
    await db.refresh(row)
    return _inspection_to_out(row)


@router.delete("/tickets/{ticket_id}/inspection", status_code=204)
async def delete_ticket_inspection(
    ticket_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required)
) -> None:
    row = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="inspection not found")

    request_row = await db.get(RepairRequest, ticket_id)
    if request_row:
        await _require_handler(request_row, user, db)

    before = _inspection_to_out(row).model_dump(mode="json")
    inspection_id = row.id
    await db.delete(row)
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.DELETE,
        target_type=TargetType.INSPECTION,
        target_id=inspection_id,
        target_name=f"驗收單 #{inspection_id} (報修單 #{ticket_id})",
        detail={"before": before},
    )
    await db.commit()


@router.get("/tickets/{ticket_id}/record", response_model=RepairRecordOut)
async def get_ticket_record(
    ticket_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> RepairRecordOut:
    row = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="repair record not found")

    request_row = await db.get(RepairRequest, row.request_id)
    if user.get("role") != "ADMIN" and request_row.requester_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    vendor = await db.get(Vendor, row.vendor_id) if row.vendor_id else None
    return _record_to_out(row, vendor_name=vendor.name if vendor else None)


@router.post("/tickets/{ticket_id}/record", response_model=RepairRecordOut, status_code=201)
async def create_ticket_record(
    ticket_id: int, payload: RepairRecordCreate, db: AsyncSession = Depends(get_db), user=Depends(admin_required)
) -> RepairRecordOut:
    request_row = await db.get(RepairRequest, ticket_id)
    if request_row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    await _require_handler(request_row, user, db)

    existing = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="repair record already exists")

    vendor = await db.get(Vendor, payload.vendor_id)
    if vendor is None:
        raise HTTPException(status_code=400, detail="vendor not found")

    row = RepairRecord(
        request_id=ticket_id,
        repair_date=payload.repair_date,
        issue_description=payload.issue_description,
        solution=payload.solution,
        cost=payload.cost,
        vendor_id=vendor.id,
    )
    db.add(row)
    await db.flush()
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.CREATE,
        target_type=TargetType.RECORD,
        target_id=row.id,
        target_name=f"維修記錄 #{row.id} (報修單 #{ticket_id})",
        detail={"after": payload.model_dump(mode="json")},
    )
    await db.commit()
    await db.refresh(row)
    return _record_to_out(row, vendor_name=vendor.name)


@router.put("/tickets/{ticket_id}/record", response_model=RepairRecordOut)
async def update_ticket_record(
    ticket_id: int, payload: RepairRecordUpdate, db: AsyncSession = Depends(get_db), user=Depends(admin_required)
) -> RepairRecordOut:
    row = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="repair record not found")

    request_row = await db.get(RepairRequest, row.request_id)
    if request_row:
        await _require_handler(request_row, user, db)

    vendor = await db.get(Vendor, payload.vendor_id)
    if vendor is None:
        raise HTTPException(status_code=400, detail="vendor not found")

    old_vendor = await db.get(Vendor, row.vendor_id) if row.vendor_id else None
    before = _record_to_out(row, vendor_name=old_vendor.name if old_vendor else None).model_dump(mode="json")

    row.repair_date = payload.repair_date
    row.issue_description = payload.issue_description
    row.solution = payload.solution
    row.cost = payload.cost
    row.vendor_id = vendor.id

    after = _record_to_out(row, vendor_name=vendor.name).model_dump(mode="json")
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.RECORD,
        target_id=row.id,
        target_name=f"維修記錄 #{row.id} (報修單 #{ticket_id})",
        detail={"before": before, "after": after},
    )
    await db.commit()
    await db.refresh(row)
    return _record_to_out(row, vendor_name=vendor.name)


@router.delete("/tickets/{ticket_id}/record", status_code=204)
async def delete_ticket_record(
    ticket_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required)
) -> None:
    row = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="repair record not found")

    request_row = await db.get(RepairRequest, row.request_id)
    if request_row:
        await _require_handler(request_row, user, db)

    vendor = await db.get(Vendor, row.vendor_id) if row.vendor_id else None
    before = _record_to_out(row, vendor_name=vendor.name if vendor else None).model_dump(mode="json")
    record_id = row.id
    await db.delete(row)
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.DELETE,
        target_type=TargetType.RECORD,
        target_id=record_id,
        target_name=f"維修記錄 #{record_id} (報修單 #{ticket_id})",
        detail={"before": before},
    )
    await db.commit()


@router.get("/tickets/{ticket_id}/attachments", response_model=list[AttachmentOut])
async def list_ticket_attachments(
    ticket_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> list[AttachmentOut]:
    request_row = await db.get(RepairRequest, ticket_id)
    if request_row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    # 權限判斷：ADMIN 可讀取所有，USER 只能讀取自己的票單
    if user.get("role") != "ADMIN" and request_row.requester_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    # 取得維修紀錄 ID（若有）
    record_row = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    record_id = record_row.id if record_row else None

    # 取得驗收單 ID（若有）
    inspection_row = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    inspection_id = inspection_row.id if inspection_row else None

    conditions = [
        (Attachment.attachable_type == "REPAIR_REQUEST") & (Attachment.attachable_id == ticket_id)
    ]
    if record_id is not None:
        conditions.append(
            (Attachment.attachable_type == "REPAIR_RECORD") & (Attachment.attachable_id == record_id)
        )
    if inspection_id is not None:
        conditions.append(
            (Attachment.attachable_type == "REPAIR_INSPECTION") & (Attachment.attachable_id == inspection_id)
        )

    rows = (await db.scalars(select(Attachment).where(or_(*conditions)).order_by(Attachment.id.desc()))).all()
    return [_attachment_to_out(row) for row in rows]


@router.get("/attachments", response_model=list[AttachmentOut])
async def list_attachments(db: AsyncSession = Depends(get_db), user=Depends(admin_required)) -> list[AttachmentOut]:
    rows = (await db.scalars(select(Attachment).order_by(Attachment.id.desc()))).all()
    return [_attachment_to_out(row) for row in rows]


@router.get("/attachments/{attachment_id}", response_model=AttachmentOut)
async def get_attachment(
    attachment_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> AttachmentOut:
    row = await db.get(Attachment, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="attachment not found")

    owner_id = await _extract_attachment_owner(db, row, user)
    # 權限判斷：ADMIN 可讀取所有附件，USER 只能讀取自己的附件
    if user.get("role") != "ADMIN" and owner_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    return _attachment_to_out(row)


# @router.post("/attachments", response_model=AttachmentOut, status_code=201)
# async def create_attachment(payload: AttachmentCreate, db: AsyncSession = Depends(get_db)) -> AttachmentOut:
#     await _ensure_attachable_exists(db, payload.attachable_type, payload.attachable_id)

#     row = Attachment(
#         attachable_type=payload.attachable_type,
#         attachable_id=payload.attachable_id,
#         file_url=payload.file_url,
#         file_type=payload.file_type,
#         file_name=payload.file_name,
#     )
#     db.add(row)
#     await db.commit()
#     await db.refresh(row)
#     return _attachment_to_out(row)


@router.post("/attachments", response_model=AttachmentOut, status_code=201)
@limiter.limit("30/minute")
async def create_and_upload_attachment(
    request: Request,
    attachable_type: AttachmentAttachableType = Form(...),
    attachable_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> AttachmentOut:
    await _ensure_attachable_exists(db, attachable_type, attachable_id)

    if (file.content_type or "") not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported image type: {file.content_type}. allowed: {sorted(ALLOWED_IMAGE_CONTENT_TYPES)}",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file is not allowed")
    if len(data) > MAX_ATTACHMENT_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="file too large, max size is 5MB")

    file_name = _safe_filename(file.filename)
    key = f"attachments/{attachable_type.lower()}/{attachable_id}/{uuid4().hex}_{file_name}"
    await storage.upload(key, data)

    try:
        row = Attachment(
            attachable_type=attachable_type,
            attachable_id=attachable_id,
            file_url=key,
            file_type="IMAGE",
            file_name=file_name,
        )
        db.add(row)
        await db.flush()
        await log_action(
            db,
            user_id=user["user_id"],
            actor_name=user["name"],
            action=Action.CREATE,
            target_type=TargetType.ATTACHMENT,
            target_id=row.id,
            target_name=row.file_name,
            detail={"after": {"file_name": row.file_name, "file_type": row.file_type, "attachable_type": row.attachable_type, "attachable_id": row.attachable_id}},
        )
        await db.commit()
        await db.refresh(row)
    except Exception:
        await storage.delete(key)
        raise

    return _attachment_to_out(row)


@router.put("/attachments/{attachment_id}", response_model=AttachmentOut)
async def update_attachment(
    attachment_id: int, payload: AttachmentUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> AttachmentOut:
    row = await db.get(Attachment, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="attachment not found")

    owner_id = await _extract_attachment_owner(db, row, user)
    # 權限判斷：只能更新自己的附件
    if owner_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    before = {"file_name": row.file_name, "file_type": row.file_type, "file_url": row.file_url}
    row.file_url = payload.file_url
    row.file_type = payload.file_type
    row.file_name = payload.file_name

    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.ATTACHMENT,
        target_id=attachment_id,
        target_name=row.file_name,
        detail={"before": before, "after": {"file_name": payload.file_name, "file_type": payload.file_type, "file_url": payload.file_url}},
    )
    await db.commit()
    await db.refresh(row)
    return _attachment_to_out(row)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
) -> None:
    row = await db.get(Attachment, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="attachment not found")

    owner_id = await _extract_attachment_owner(db, row, user)
    # 權限判斷：只能刪除自己的附件
    if owner_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not _is_remote_url(row.file_url):
        await storage.delete(row.file_url)

    before = {
        "file_name": row.file_name,
        "file_type": row.file_type,
        "attachable_type": row.attachable_type,
        "attachable_id": row.attachable_id,
    }
    await db.delete(row)
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.DELETE,
        target_type=TargetType.ATTACHMENT,
        target_id=attachment_id,
        target_name=row.file_name,
        detail={"before": before},
    )
    await db.commit()