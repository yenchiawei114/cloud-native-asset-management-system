"""將範例 assets 資料寫入本地 DB。具冪等性：已存在的資料會自動略過。"""

import asyncio
import sys

from sqlalchemy import select

from app.core.db import WriteSession, dispose_engines
from app.models import Asset

SAMPLES = [
    {"name": "sample-1.txt", "path": "samples/sample-1.txt", "content_type": "text/plain", "size_bytes": 12},
    {"name": "sample-2.txt", "path": "samples/sample-2.txt", "content_type": "text/plain", "size_bytes": 24},
    {"name": "logo.png", "path": "samples/logo.png", "content_type": "image/png", "size_bytes": 2048},
]


async def run() -> None:
    inserted = 0
    async with WriteSession() as session:
        for row in SAMPLES:
            existing = await session.scalar(select(Asset).where(Asset.path == row["path"]))
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
