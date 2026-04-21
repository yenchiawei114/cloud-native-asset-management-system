from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import RepairInspection, RepairRecord, RepairRequest, Attachment
from app.core.cache import redis

router = APIRouter()
CACHE_TTL_SECONDS = 60


def _ticket_cache_key(ticket_id: int) -> str:
    return f"ticket:{ticket_id}"


class RepairRequestCreate(BaseModel):
    asset_id: int
    requester_id: int
    description: str
    need_backup: bool = False
    backup_spec: str | None = None
    expected_completion_date: date | None = None
    pickup_location: str | None = None


class RepairRequestStatusUpdate(BaseModel):
    status: Literal["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]


class RepairRequestUpdate(BaseModel):
    asset_id: int
    requester_id: int
    description: str
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
    expected_completion_date: date | None
    pickup_location: str | None
    created_at: datetime
    version: int


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
    vendor: str


class RepairInspectionUpdate(BaseModel):
    status: bool
    note: str | None = None
    checked_by: int


class RepairRecordUpdate(BaseModel):
    repair_date: date
    issue_description: str
    solution: str
    cost: int = 0
    vendor: str


class RepairRecordOut(BaseModel):
    id: int
    request_id: int
    repair_date: date
    issue_description: str
    solution: str
    cost: int
    vendor: str
    created_at: datetime


AttachmentAttachableType = Literal["REPAIR_REQUEST", "REPAIR_INSPECTION", "REPAIR_RECORD"]
AttachmentFileType = Literal["IMAGE", "VIDEO", "DOCUMENT", "OTHER"]


class AttachmentCreate(BaseModel):
    attachable_type: AttachmentAttachableType
    attachable_id: int
    file_url: str
    file_type: AttachmentFileType
    file_name: str


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


def _request_to_out(row: RepairRequest) -> RepairRequestOut:
    return RepairRequestOut(
        id=row.id,
        asset_id=row.asset_id,
        requester_id=row.requester_id,
        description=row.description,
        need_backup=row.need_backup,
        backup_spec=row.backup_spec,
        status=row.status,
        expected_completion_date=row.expected_completion_date,
        pickup_location=row.pickup_location,
        created_at=row.created_at,
        version=row.version,
    )


def _inspection_to_out(row: RepairInspection) -> RepairInspectionOut:
    return RepairInspectionOut(
        id=row.id,
        request_id=row.request_id,
        status=row.status,
        note=row.note,
        checked_by=row.checked_by,
        checked_at=row.checked_at,
    )


def _record_to_out(row: RepairRecord) -> RepairRecordOut:
    return RepairRecordOut(
        id=row.id,
        request_id=row.request_id,
        repair_date=row.repair_date,
        issue_description=row.issue_description,
        solution=row.solution,
        cost=row.cost,
        vendor=row.vendor,
        created_at=row.created_at,
    )


def _attachment_to_out(row: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=row.id,
        attachable_type=row.attachable_type,
        attachable_id=row.attachable_id,
        file_url=row.file_url,
        file_type=row.file_type,
        file_name=row.file_name,
        created_at=row.created_at,
    )


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


@router.get("/tickets", response_model=list[RepairRequestOut])
async def list_tickets(db: AsyncSession = Depends(get_db)) -> list[RepairRequestOut]:
    rows = (await db.scalars(select(RepairRequest).order_by(RepairRequest.id.desc()))).all()
    return [_request_to_out(r) for r in rows]


@router.get("/tickets/{ticket_id}", response_model=RepairRequestOut)
async def get_ticket(ticket_id: int, db: AsyncSession = Depends(get_db)) -> RepairRequestOut:
    cache_key = _ticket_cache_key(ticket_id)
    cached = await redis.get(cache_key)
    if cached:
        return RepairRequestOut.model_validate_json(cached)

    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    result = _request_to_out(row)
    await redis.setex(cache_key, CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.post("/tickets", response_model=RepairRequestOut, status_code=201)
async def create_ticket(payload: RepairRequestCreate, db: AsyncSession = Depends(get_db)) -> RepairRequestOut:
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
    await db.commit()
    await db.refresh(row)

    result = _request_to_out(row)
    await redis.setex(_ticket_cache_key(result.id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.put("/tickets/{ticket_id}", response_model=RepairRequestOut)
async def update_ticket(
    ticket_id: int,
    payload: RepairRequestUpdate,
    db: AsyncSession = Depends(get_db),
) -> RepairRequestOut:
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    row.asset_id = payload.asset_id
    row.requester_id = payload.requester_id
    row.description = payload.description
    row.need_backup = payload.need_backup
    row.backup_spec = payload.backup_spec
    row.status = payload.status
    row.expected_completion_date = payload.expected_completion_date
    row.pickup_location = payload.pickup_location
    row.version += 1

    await db.commit()
    await db.refresh(row)

    result = _request_to_out(row)
    await redis.setex(_ticket_cache_key(ticket_id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.patch("/tickets/{ticket_id}/status", response_model=RepairRequestOut)
async def update_ticket_status(
    ticket_id: int,
    payload: RepairRequestStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> RepairRequestOut:
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    row.status = payload.status
    row.version += 1
    await db.commit()
    await db.refresh(row)

    result = _request_to_out(row)
    await redis.setex(_ticket_cache_key(ticket_id), CACHE_TTL_SECONDS, result.model_dump_json())
    return result


@router.delete("/tickets/{ticket_id}", status_code=204)
async def delete_ticket(ticket_id: int, db: AsyncSession = Depends(get_db)) -> None:
    row = await db.get(RepairRequest, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    await db.delete(row)
    await db.commit()
    await redis.delete(_ticket_cache_key(ticket_id))


@router.get("/tickets/{ticket_id}/inspection", response_model=RepairInspectionOut)
async def get_ticket_inspection(ticket_id: int, db: AsyncSession = Depends(get_db)) -> RepairInspectionOut:
    row = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="inspection not found")
    return _inspection_to_out(row)


@router.post("/tickets/{ticket_id}/inspection", response_model=RepairInspectionOut, status_code=201)
async def create_ticket_inspection(
    ticket_id: int,
    payload: RepairInspectionCreate,
    db: AsyncSession = Depends(get_db),
) -> RepairInspectionOut:
    request_row = await db.get(RepairRequest, ticket_id)
    if request_row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    existing = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="inspection already exists")

    row = RepairInspection(
        request_id=ticket_id,
        status=payload.status,
        note=payload.note,
        checked_by=payload.checked_by,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _inspection_to_out(row)


@router.put("/tickets/{ticket_id}/inspection", response_model=RepairInspectionOut)
async def update_ticket_inspection(
    ticket_id: int,
    payload: RepairInspectionUpdate,
    db: AsyncSession = Depends(get_db),
) -> RepairInspectionOut:
    row = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="inspection not found")

    row.status = payload.status
    row.note = payload.note
    row.checked_by = payload.checked_by

    await db.commit()
    await db.refresh(row)
    return _inspection_to_out(row)


@router.delete("/tickets/{ticket_id}/inspection", status_code=204)
async def delete_ticket_inspection(ticket_id: int, db: AsyncSession = Depends(get_db)) -> None:
    row = (await db.scalars(select(RepairInspection).where(RepairInspection.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="inspection not found")

    await db.delete(row)
    await db.commit()


@router.get("/tickets/{ticket_id}/record", response_model=RepairRecordOut)
async def get_ticket_record(ticket_id: int, db: AsyncSession = Depends(get_db)) -> RepairRecordOut:
    row = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="repair record not found")
    return _record_to_out(row)


@router.post("/tickets/{ticket_id}/record", response_model=RepairRecordOut, status_code=201)
async def create_ticket_record(
    ticket_id: int,
    payload: RepairRecordCreate,
    db: AsyncSession = Depends(get_db),
) -> RepairRecordOut:
    request_row = await db.get(RepairRequest, ticket_id)
    if request_row is None:
        raise HTTPException(status_code=404, detail="ticket not found")

    existing = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="repair record already exists")

    row = RepairRecord(
        request_id=ticket_id,
        repair_date=payload.repair_date,
        issue_description=payload.issue_description,
        solution=payload.solution,
        cost=payload.cost,
        vendor=payload.vendor,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _record_to_out(row)


@router.put("/tickets/{ticket_id}/record", response_model=RepairRecordOut)
async def update_ticket_record(
    ticket_id: int,
    payload: RepairRecordUpdate,
    db: AsyncSession = Depends(get_db),
) -> RepairRecordOut:
    row = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="repair record not found")

    row.repair_date = payload.repair_date
    row.issue_description = payload.issue_description
    row.solution = payload.solution
    row.cost = payload.cost
    row.vendor = payload.vendor

    await db.commit()
    await db.refresh(row)
    return _record_to_out(row)


@router.delete("/tickets/{ticket_id}/record", status_code=204)
async def delete_ticket_record(ticket_id: int, db: AsyncSession = Depends(get_db)) -> None:
    row = (await db.scalars(select(RepairRecord).where(RepairRecord.request_id == ticket_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="repair record not found")

    await db.delete(row)
    await db.commit()


@router.get("/attachments", response_model=list[AttachmentOut])
async def list_attachments(db: AsyncSession = Depends(get_db)) -> list[AttachmentOut]:
    rows = (await db.scalars(select(Attachment).order_by(Attachment.id.desc()))).all()
    return [_attachment_to_out(row) for row in rows]


@router.get("/attachments/{attachment_id}", response_model=AttachmentOut)
async def get_attachment(attachment_id: int, db: AsyncSession = Depends(get_db)) -> AttachmentOut:
    row = await db.get(Attachment, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="attachment not found")
    return _attachment_to_out(row)


@router.post("/attachments", response_model=AttachmentOut, status_code=201)
async def create_attachment(payload: AttachmentCreate, db: AsyncSession = Depends(get_db)) -> AttachmentOut:
    await _ensure_attachable_exists(db, payload.attachable_type, payload.attachable_id)

    row = Attachment(
        attachable_type=payload.attachable_type,
        attachable_id=payload.attachable_id,
        file_url=payload.file_url,
        file_type=payload.file_type,
        file_name=payload.file_name,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _attachment_to_out(row)


@router.put("/attachments/{attachment_id}", response_model=AttachmentOut)
async def update_attachment(
    attachment_id: int,
    payload: AttachmentUpdate,
    db: AsyncSession = Depends(get_db),
) -> AttachmentOut:
    row = await db.get(Attachment, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="attachment not found")

    row.file_url = payload.file_url
    row.file_type = payload.file_type
    row.file_name = payload.file_name

    await db.commit()
    await db.refresh(row)
    return _attachment_to_out(row)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(attachment_id: int, db: AsyncSession = Depends(get_db)) -> None:
    row = await db.get(Attachment, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="attachment not found")

    await db.delete(row)
    await db.commit()
