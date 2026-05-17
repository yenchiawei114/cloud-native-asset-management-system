"""將範例資料寫入本地 DB：Department、User、Asset、Repair Tickets、Attachments。具冪等性：已存在的資料會自動略過。"""

import asyncio
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.core.db import Session, dispose_engines
from app.core.security import hash_password
from app.models import (
    Asset,
    User,
    Department,
    OfficeLocation,
    RepairRequest,
    RepairInspection,
    RepairRecord,
    Attachment,
    NotificationPreference,
    AuditLog,
    Vendor,
)
from app.models.asset import AssetType, AssetStatus
from app.models.user import Role, Sex
from app.models.audit_log import Action, TargetType
from app.models.notification_preference import NoteType

VENDORS = [
    "Apple Inc.",
    "Dell",
    "Samsung",
    "HP",
    "Cisco",
]

OFFICE_LOCATIONS = [
    "Taipei HQ - Building A, 2F",
    "Taipei HQ - Building A, 3F",
    "Taipei HQ - Building A, 4F",
    "Taipei HQ - Building B, 1F",
    "Taipei HQ - Building C, 1F",
]

# 5 Departments
DEPARTMENTS = [
    {"name": "Engineering"},
    {"name": "Information Technology"},
    {"name": "Marketing"},
    {"name": "Human Resources"},
    {"name": "Finance"},
]

# 預設辦公地點（與前端常數對應）
LOC_A2 = "Taipei HQ - Building A, 2F"
LOC_A3 = "Taipei HQ - Building A, 3F"
LOC_A4 = "Taipei HQ - Building A, 4F"
LOC_B1 = "Taipei HQ - Building B, 1F"
LOC_C1 = "Taipei HQ - Building C, 1F"

# 10 Users
USERS = [
    {
        "employee_id": "EMP202601",
        "password": "iloventuim",
        "name": "ChiaWei Yen",
        "sex": Sex.MALE,
        "role": Role.ADMIN,
        "email": "ycweicloudnative@gmail.com",
        "department_id": 1,
        "location": LOC_A4,
        "hire_date": date(2024, 3, 1),
    },
    {
        "employee_id": "EMP202602",
        "password": "password123",
        "name": "Boning Wang",
        "sex": Sex.MALE,
        "role": Role.ADMIN,
        "email": "bob@example.com",
        "department_id": 1,
        "location": LOC_A4,
        "hire_date": date(2024, 3, 1),
    },
    {
        "employee_id": "EMP202603",
        "password": "password456",
        "name": "Xinyi Liu",
        "sex": Sex.FEMALE,
        "role": Role.EMPLOYEE,
        "email": "carol@example.com",
        "department_id": 4,
        "location": LOC_C1,
        "hire_date": date(2024, 6, 15),
    },
    {
        "employee_id": "EMP202604",
        "password": "password789",
        "name": "Haoran Li",
        "sex": Sex.MALE,
        "role": Role.EMPLOYEE,
        "email": "david@example.com",
        "department_id": 1,
        "location": LOC_A4,
        "hire_date": date(2024, 8, 1),
    },
    {
        "employee_id": "EMP202605",
        "password": "password1001",
        "name": "Siyu Wu",
        "sex": Sex.FEMALE,
        "role": Role.EMPLOYEE,
        "email": "emma@example.com",
        "department_id": 2,
        "location": LOC_A3,
        "hire_date": date(2024, 9, 1),
    },
    {
        "employee_id": "EMP202606",
        "password": "aabbccddee",
        "name": "Jianfeng Chen",
        "sex": Sex.MALE,
        "role": Role.EMPLOYEE,
        "email": "frank@example.com",
        "department_id": 2,
        "location": LOC_A2,
        "hire_date": date(2024, 10, 15),
    },
    {
        "employee_id": "EMP202607",
        "password": "thisisgrace",
        "name": "Enhui Tang",
        "sex": Sex.FEMALE,
        "role": Role.EMPLOYEE,
        "email": "grace@example.com",
        "department_id": 3,
        "location": LOC_B1,
        "hire_date": date(2025, 1, 6),
    },
    {
        "employee_id": "EMP202608",
        "password": "henrypassword",
        "name": "Haoyu Huang",
        "sex": Sex.MALE,
        "role": Role.EMPLOYEE,
        "email": "henry@example.com",
        "department_id": 5,
        "location": LOC_C1,
        "hire_date": date(2025, 3, 3),
    },
    {
        "employee_id": "EMP202609",
        "password": "iris0811",
        "name": "Xiaowei Guo",
        "sex": Sex.FEMALE,
        "role": Role.EMPLOYEE,
        "email": "iris@example.com",
        "department_id": 5,
        "location": LOC_C1,
        "hire_date": date(2025, 4, 7),
    },
    {
        "employee_id": "EMP202610",
        "password": "givejackmoney",
        "name": "Jieke Yang",
        "sex": Sex.MALE,
        "role": Role.EMPLOYEE,
        "email": "jack@example.com",
        "department_id": 1,
        "location": LOC_A4,
        "hire_date": date(2025, 7, 14),
    },
]

# 20 Assets
ASSETS = [
    {
        "asset_code": "LAP2024001",
        "name": "MacBook Pro 16",
        "type": AssetType.LAPTOP,
        "model": "M3 Max / 64GB / 2TB",
        "specification": "Space Black, 16-inch Retina Display",
        "vendor": "Apple Inc.",
        "purchase_date": date(2024, 1, 15),
        "purchase_price": 95000,
        "storage_location": "Taipei HQ - 4F Storage A",
        "owner_id": 2,
        "activation_date": date(2024, 1, 20),
        "warranty_expiry": date(2027, 1, 20),
        "status": AssetStatus.AVAILABLE,
    },
    {
        "asset_code": "LAP2024002",
        "name": "Dell XPS 15",
        "type": AssetType.LAPTOP,
        "model": "Intel i9 / 32GB / 1TB SSD",
        "specification": "Silver, FHD Display",
        "vendor": "Dell",
        "purchase_date": date(2024, 2, 10),
        "purchase_price": 85000,
        "storage_location": None,
        "owner_id": 1,
        "activation_date": date(2024, 2, 15),
        "warranty_expiry": date(2026, 2, 15),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "LAP2024003",
        "name": "Lenovo ThinkPad",
        "type": AssetType.LAPTOP,
        "model": "X1 Carbon / 16GB / 512GB",
        "specification": "Black, 14-inch FHD",
        "vendor": "Lenovo",
        "purchase_date": date(2024, 3, 5),
        "purchase_price": 65000,
        "storage_location": "Taipei HQ - 4F Storage B",
        "owner_id": 1,
        "activation_date": date(2024, 3, 10),
        "warranty_expiry": date(2026, 3, 10),
        "status": AssetStatus.AVAILABLE,
    },
    {
        "asset_code": "DES2024001",
        "name": "iMac 27",
        "type": AssetType.DESKTOP,
        "model": "M3 / 32GB / 512GB",
        "specification": "5K Retina Display, Aluminum",
        "vendor": "Apple Inc.",
        "purchase_date": date(2024, 1, 20),
        "purchase_price": 150000,
        "storage_location": None,
        "owner_id": 1,
        "activation_date": date(2024, 1, 25),
        "warranty_expiry": date(2027, 1, 25),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "DES2024002",
        "name": "Dell OptiPlex",
        "type": AssetType.DESKTOP,
        "model": "5090 / i7 / 16GB / 512GB SSD",
        "specification": "Black, Tower Form Factor",
        "vendor": "Dell",
        "purchase_date": date(2024, 2, 1),
        "purchase_price": 45000,
        "storage_location": None,
        "owner_id": 2,
        "activation_date": date(2024, 2, 5),
        "warranty_expiry": date(2026, 2, 5),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "PHN2024050",
        "name": "iPhone 15 Pro",
        "type": AssetType.PHONE,
        "model": "128GB / Titanium Blue",
        "specification": "Testing Device - iOS 17",
        "vendor": "Apple Inc.",
        "purchase_date": date(2024, 2, 1),
        "purchase_price": 36900,
        "storage_location": None,
        "owner_id": 5,
        "activation_date": date(2024, 2, 5),
        "warranty_expiry": date(2025, 2, 5),
        "status": AssetStatus.BORROWED,
    },
    {
        "asset_code": "PHN2024051",
        "name": "Samsung Galaxy S24",
        "type": AssetType.PHONE,
        "model": "256GB / Phantom Black",
        "specification": "Android 14, 6.2-inch Display",
        "vendor": "Samsung",
        "purchase_date": date(2024, 3, 15),
        "purchase_price": 29900,
        "storage_location": "Taipei HQ - Testing Lab",
        "owner_id": 2,
        "activation_date": date(2024, 3, 20),
        "warranty_expiry": date(2025, 3, 20),
        "status": AssetStatus.AVAILABLE,
    },
    {
        "asset_code": "TAB2024001",
        "name": "iPad Pro 12.9",
        "type": AssetType.TABLET,
        "model": "M2 / 256GB / Wi-Fi",
        "specification": "Space Gray, Liquid Retina Display",
        "vendor": "Apple Inc.",
        "purchase_date": date(2024, 1, 30),
        "purchase_price": 52000,
        "storage_location": None,
        "owner_id": 3,
        "activation_date": date(2024, 2, 1),
        "warranty_expiry": date(2026, 2, 1),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "TAB2024002",
        "name": "Samsung Galaxy Tab S9",
        "type": AssetType.TABLET,
        "model": "128GB / Silver",
        "specification": "11-inch AMOLED, Snapdragon 8 Gen 2",
        "vendor": "Samsung",
        "purchase_date": date(2024, 4, 10),
        "purchase_price": 28000,
        "storage_location": "Taipei HQ - Conference Room",
        "owner_id": 1,
        "activation_date": date(2024, 4, 15),
        "warranty_expiry": date(2025, 4, 15),
        "status": AssetStatus.AVAILABLE,
    },
    {
        "asset_code": "SRV2024099",
        "name": "Dell PowerEdge R750",
        "type": AssetType.SERVER,
        "model": "Xeon Gold 6330 / 128GB RAM",
        "specification": "2U Rack Server, 1.2TB SAS x 4",
        "vendor": "Dell Technologies",
        "purchase_date": date(2023, 11, 5),
        "purchase_price": 250000,
        "storage_location": None,
        "owner_id": 1,
        "activation_date": date(2023, 11, 10),
        "warranty_expiry": date(2026, 11, 10),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "SRV2024100",
        "name": "HP ProLiant DL380 Gen11",
        "type": AssetType.SERVER,
        "model": "Xeon Gold 6426Y / 256GB RAM",
        "specification": "2U Rack, 2.4TB SAS x 6",
        "vendor": "HP",
        "purchase_date": date(2024, 1, 10),
        "purchase_price": 280000,
        "storage_location": None,
        "owner_id": 2,
        "activation_date": date(2024, 1, 15),
        "warranty_expiry": date(2027, 1, 15),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "NET2024001",
        "name": "Cisco Catalyst 9300",
        "type": AssetType.NETWORK,
        "model": "C9300-48P",
        "specification": "48-port Gigabit, Layer 3 Switch",
        "vendor": "Cisco",
        "purchase_date": date(2023, 12, 1),
        "purchase_price": 180000,
        "storage_location": None,
        "owner_id": 1,
        "activation_date": date(2023, 12, 5),
        "warranty_expiry": date(2025, 12, 5),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "NET2024002",
        "name": "Juniper SRX5400",
        "type": AssetType.NETWORK,
        "model": "Security Appliance",
        "specification": "1U, Throughput 50Gbps, Max connections 1M",
        "vendor": "Juniper",
        "purchase_date": date(2024, 2, 20),
        "purchase_price": 350000,
        "storage_location": None,
        "owner_id": 3,
        "activation_date": date(2024, 2, 25),
        "warranty_expiry": date(2027, 2, 25),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "MON2024001",
        "name": "LG UltraWide 34",
        "type": AssetType.OTHER,
        "model": "34UP550 / 34-inch",
        "specification": "Nano IPS, 5120x2160, USB-C 90W",
        "vendor": "LG",
        "purchase_date": date(2024, 3, 1),
        "purchase_price": 35000,
        "storage_location": "Taipei HQ - 4F Storage A",
        "owner_id": 2,
        "activation_date": date(2024, 3, 5),
        "warranty_expiry": date(2026, 3, 5),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "MON2024002",
        "name": "Dell P2423D",
        "type": AssetType.OTHER,
        "model": "24-inch Professional",
        "specification": "IPS, 2560x1440, 99% sRGB",
        "vendor": "Dell",
        "purchase_date": date(2024, 3, 10),
        "purchase_price": 15000,
        "storage_location": "Taipei HQ - 4F Storage B",
        "owner_id": 2,
        "activation_date": date(2024, 3, 15),
        "warranty_expiry": date(2026, 3, 15),
        "status": AssetStatus.AVAILABLE,
    },
    {
        "asset_code": "PRN2024001",
        "name": "HP Color LaserJet Pro",
        "type": AssetType.OTHER,
        "model": "M255dw / Color Printer",
        "specification": "Network, Mobile Print, Copy/Scan",
        "vendor": "HP",
        "purchase_date": date(2024, 1, 5),
        "purchase_price": 18000,
        "storage_location": None,
        "owner_id": 1,
        "activation_date": date(2024, 1, 10),
        "warranty_expiry": date(2026, 1, 10),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "PRN2024002",
        "name": "Xerox AltaLink C7070",
        "type": AssetType.OTHER,
        "model": "Multifunction Printer",
        "specification": "Color, Large Format, 70ppm",
        "vendor": "Xerox",
        "purchase_date": date(2023, 10, 15),
        "purchase_price": 95000,
        "storage_location": None,
        "owner_id": 2,
        "activation_date": date(2023, 10, 20),
        "warranty_expiry": date(2025, 10, 20),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "ACC2024001",
        "name": "Apple Magic Keyboard",
        "type": AssetType.OTHER,
        "model": "Wireless, Touch ID",
        "specification": "Space Gray, Rechargeable",
        "vendor": "Apple Inc.",
        "purchase_date": date(2024, 2, 28),
        "purchase_price": 4800,
        "storage_location": "Taipei HQ - Accessories Room",
        "owner_id": 1,
        "activation_date": date(2024, 3, 1),
        "warranty_expiry": date(2025, 3, 1),
        "status": AssetStatus.AVAILABLE,
    },
    {
        "asset_code": "ACC2024002",
        "name": "Logitech MX Master 3S",
        "type": AssetType.OTHER,
        "model": "Wireless Mouse",
        "specification": "Multi-device, 8K Sensor, Rechargeable",
        "vendor": "Logitech",
        "purchase_date": date(2024, 3, 8),
        "purchase_price": 4200,
        "storage_location": "Taipei HQ - Accessories Room",
        "owner_id": 2,
        "activation_date": date(2024, 3, 10),
        "warranty_expiry": date(2026, 3, 10),
        "status": AssetStatus.AVAILABLE,
    },
]

REPAIR_REQUESTS = [
    {
        "asset_index": 0,
        "requester_index": 0,
        "description": "Laptop screen flickering and occasional kernel panic",
        "need_backup": True,
        "backup_spec": "Full system backup to 2TB external SSD",
        "status": "IN_PROGRESS",
        "expected_completion_days": 5,
        "pickup_location": "Office 4F Reception",
    },
]

REPAIR_INSPECTIONS = [
    {
        "request_index": 0,
        "checked_by_index": 1,
        "status": True,
        "note": "Hardware diagnostics passed. Software issue suspected. GPU driver update recommended.",
    },
]

REPAIR_RECORDS = [
    {
        "request_index": 0,
        "repair_date_days": 0,
        "issue_description": "GPU driver corrupted, causing display glitches and system instability",
        "solution": "Reinstalled macOS Big Sur, updated GPU drivers to latest version",
        "cost": 2500,
        "vendor": "Apple Service Center",
    },
]

ATTACHMENTS = [
    {
        "attachable_type": "REPAIR_INSPECTION",
        "attachable_index": 0,
        "file_url": "https://storage.example.com/repairs/LAP2024001_ok.jpg",
        "file_type": "IMAGE",
        "file_name": "LAP2024001_ok.jpg",
    },
]

AUDIT_LOGS = [
    {
        "user_index": 0,
        "actor_name": "seed-script",
        "action": Action.CREATE,
        "target_type": TargetType.USER,
        "target_index": 9,
        "target_name": "Seed User",
        "detail": {"info": "created by seed"},
    }
]

NOTIFICATION_PREFERENCES = [
    {
        "user_index": 0,
        "type": NoteType.EMAIL,
        "value": "ycweicloudnative@gmail.com",  # will default to user's email
    }
]

async def run() -> None:
    async with Session() as session:
        # Seed Vendors
        vendor_count = 0
        for vendor_name in VENDORS:
            existing = await session.scalar(select(Vendor).where(Vendor.name == vendor_name))
            if existing:
                continue
            session.add(Vendor(name=vendor_name))
            vendor_count += 1
        await session.commit()
        print(f"seeded: {vendor_count} vendor(s)")

        # Seed OfficeLocation
        loc_count = 0
        for loc_name in OFFICE_LOCATIONS:
            existing = await session.scalar(select(OfficeLocation).where(OfficeLocation.name == loc_name))
            if existing:
                continue
            session.add(OfficeLocation(name=loc_name))
            loc_count += 1
        await session.commit()
        print(f"seeded: {loc_count} office location(s)")

        # Seed Department
        dept_count = 0
        for dept_data in DEPARTMENTS:
            existing = await session.scalar(select(Department).where(Department.name == dept_data["name"]))
            if existing:
                continue
            dept = Department(**dept_data)
            session.add(dept)
            dept_count += 1
        await session.commit()
        
        # Seed Users
        user_count = 0
        for user_data in USERS:
            existing = await session.scalar(select(User).where(User.employee_id == user_data["employee_id"]))
            if existing:
                continue
            
            user_data["password"] = hash_password(user_data["password"])
            user = User(**user_data)
            session.add(user)
            user_count += 1
        
        await session.commit()
        print(f"seeded: {dept_count} department(s), {user_count} user(s)")
        
        # Seed Notification Preferences
        notif_count = 0
        users_list = (await session.scalars(select(User).order_by(User.id.asc()))).all()
        for pref in NOTIFICATION_PREFERENCES:
            if pref["user_index"] >= len(users_list):
                continue
            u = users_list[pref["user_index"]]
            existing_pref = (
                await session.execute(
                    select(NotificationPreference).where(
                        NotificationPreference.user_id == u.id,
                        NotificationPreference.type == pref["type"],
                    )
                )
            ).scalar_one_or_none()
            if existing_pref:
                continue
            value = pref["value"] or u.email
            np = NotificationPreference(user_id=u.id, type=pref["type"], value=value)
            session.add(np)
            notif_count += 1
        await session.commit()
        print(f"seeded: {notif_count} notification preference(s)")

        # Seed Audit Logs
        audit_count = 0
        users_list = (await session.scalars(select(User).order_by(User.id.asc()))).all()
        for log in AUDIT_LOGS:
            if log["user_index"] >= len(users_list) or log["target_index"] >= len(users_list):
                continue
            actor = users_list[log["user_index"]]
            target = users_list[log["target_index"]]
            exists = (
                await session.execute(
                    select(AuditLog).where(
                        AuditLog.user_id == actor.id,
                        AuditLog.action == log["action"],
                        AuditLog.target_type == log["target_type"],
                        AuditLog.target_id == target.id,
                    )
                )
            ).scalar_one_or_none()
            if exists:
                continue
            al = AuditLog(
                user_id=actor.id,
                actor_name=log["actor_name"],
                action=log["action"],
                target_type=log["target_type"],
                target_id=target.id,
                target_name=log["target_name"],
                detail=log.get("detail"),
            )
            session.add(al)
            audit_count += 1
        await session.commit()
        print(f"seeded: {audit_count} audit log(s)")
        
        # Seed Assets
        asset_count = 0
        
        for asset_data in ASSETS:
            existing = await session.scalar(select(Asset).where(Asset.asset_code == asset_data["asset_code"]))
            if existing:
                continue
                
            session.add(Asset(**asset_data))
            asset_count += 1
        
        await session.commit()
        print(f"seeded: {asset_count} asset(s)")
        
        # Seed Repair Requests, Inspections, Records, Attachments
        existing_rr = await session.scalar(select(RepairRequest).limit(1))
        if not existing_rr:
            assets = (await session.scalars(select(Asset).order_by(Asset.id.asc()))).all()
            users = (await session.scalars(select(User).order_by(User.id.asc()))).all()

            repair_request_rows: list[RepairRequest] = []
            repair_inspection_rows: list[RepairInspection] = []

            for row in REPAIR_REQUESTS:
                asset = assets[row["asset_index"]]
                requester = users[row["requester_index"]]
                repair_request = RepairRequest(
                    asset_id=asset.id,
                    requester_id=requester.id,
                    description=row["description"],
                    need_backup=row["need_backup"],
                    backup_spec=row["backup_spec"],
                    status=row["status"],
                    expected_completion_date=date.today() + timedelta(days=row["expected_completion_days"]),
                    pickup_location=row["pickup_location"],
                )
                session.add(repair_request)
                await session.flush()
                repair_request_rows.append(repair_request)

            for row in REPAIR_INSPECTIONS:
                request = repair_request_rows[row["request_index"]]
                checker = users[row["checked_by_index"]]
                repair_inspection = RepairInspection(
                    request_id=request.id,
                    status=row["status"],
                    note=row["note"],
                    checked_by=checker.id,
                    checked_at=datetime.now(),
                )
                session.add(repair_inspection)
                await session.flush()
                repair_inspection_rows.append(repair_inspection)

            for row in REPAIR_RECORDS:
                request = repair_request_rows[row["request_index"]]
                repair_record = RepairRecord(
                    request_id=request.id,
                    repair_date=date.today() + timedelta(days=row["repair_date_days"]),
                    issue_description=row["issue_description"],
                    solution=row["solution"],
                    cost=row["cost"],
                    vendor=row["vendor"],
                )
                session.add(repair_record)

            for row in ATTACHMENTS:
                attachment = Attachment(
                    attachable_type=row["attachable_type"],
                    attachable_id=repair_inspection_rows[row["attachable_index"]].id,
                    file_url=row["file_url"],
                    file_type=row["file_type"],
                    file_name=row["file_name"],
                )
                session.add(attachment)

            await session.commit()
            print(f"seeded: {len(REPAIR_REQUESTS)} repair request(s), {len(REPAIR_INSPECTIONS)} inspection(s), {len(REPAIR_RECORDS)} record(s), {len(ATTACHMENTS)} attachment(s)")


def main() -> None:
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        sys.exit(130)


async def _main() -> None:
    try:
        await run()
    finally:
        await dispose_engines()


if __name__ == "__main__":
    main()
