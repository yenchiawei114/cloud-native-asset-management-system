"""將範例 assets 資料寫入本地 DB。具冪等性：已存在的資料會自動略過。"""

import asyncio
import sys

from sqlalchemy import select

from app.core.db import WriteSession, dispose_engines
from app.models import Asset

from datetime import date
from app.models.asset import AssetType, AssetStatus


SAMPLES = [
    {
        "asset_code": "LAP2024001",
        "name": "MacBook Pro 16",
        "type": AssetType.LAPTOP,
        "model": "M3 Max / 64GB / 2TB",
        "specification": "Space Black, 16-inch Retina Display",
        "vendor": "Apple Inc.",
        "purchase_date": date(2024, 1, 15),
        "purchase_price": 95000,
        "storage_location": "Office 4F - Storage A",
        "activation_date": date(2024, 1, 20),
        "warranty_expiry": date(2027, 1, 20),
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
        "storage_location": "IDC Room - Rack 05",
        "activation_date": date(2023, 11, 10),
        "warranty_expiry": date(2026, 11, 10),
        "status": AssetStatus.IN_USE,
    },
    {
        "asset_code": "PHN2024050",
        "name": "iPhone 15 Pro",
        "type": AssetType.PHONE,
        "model": "128GB / Titanium Blue",
        "specification": "Testing Device - iOS 17 pre-installed",
        "vendor": "Apple Inc.",
        "purchase_date": date(2024, 2, 1),
        "purchase_price": 36900,
        "storage_location": "Testing Lab",
        "activation_date": date(2024, 2, 5),
        "warranty_expiry": date(2025, 2, 5),
        "status": AssetStatus.BORROWED,
    }
]


async def run() -> None:
    inserted = 0
    async with WriteSession() as session:
        for row in SAMPLES:
            existing = await session.scalar(select(Asset).where(Asset.asset_code == row["asset_code"]))
            if existing:
                continue
            session.add(Asset(**row))
            inserted += 1
        await session.commit()
    print(f"seeded: {inserted} new asset(s)")


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
