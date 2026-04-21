from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import RepairInspection, RepairRecord, RepairRequest
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
    photo_url1: str | None = None
    photo_url2: str | None = None
    photo_url3: str | None = None


class RepairRequestStatusUpdate(BaseModel):
    status: str


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
    photo_url1: str | None
    photo_url2: str | None
    photo_url3: str | None


class RepairInspectionCreate(BaseModel):
    status: bool
    note: str | None = None
    checked_by: int
    photo_url1: str | None = None
    photo_url2: str | None = None
    photo_url3: str | None = None


class RepairInspectionOut(BaseModel):
    id: int
    request_id: int
    status: bool
    note: str | None
    checked_by: int
    checked_at: datetime
    photo_url1: str | None
    photo_url2: str | None
    photo_url3: str | None


class RepairRecordCreate(BaseModel):
    repair_date: date
    issue_description: str
    solution: str
    cost: int = 0
    vendor: int


class RepairRecordOut(BaseModel):
    id: int
    request_id: int
    repair_date: date
    issue_description: str
    solution: str
    cost: int
    vendor: int
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
        photo_url1=row.photo_url1,
        photo_url2=row.photo_url2,
        photo_url3=row.photo_url3,
    )


def _inspection_to_out(row: RepairInspection) -> RepairInspectionOut:
    return RepairInspectionOut(
        id=row.id,
        request_id=row.request_id,
        status=row.status,
        note=row.note,
        checked_by=row.checked_by,
        checked_at=row.checked_at,
        photo_url1=row.photo_url1,
        photo_url2=row.photo_url2,
        photo_url3=row.photo_url3,
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
        photo_url1=payload.photo_url1,
        photo_url2=payload.photo_url2,
        photo_url3=payload.photo_url3,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    result = _request_to_out(row)
    await redis.setex(_ticket_cache_key(result.id), CACHE_TTL_SECONDS, result.model_dump_json())
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
        photo_url1=payload.photo_url1,
        photo_url2=payload.photo_url2,
        photo_url3=payload.photo_url3,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _inspection_to_out(row)


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
