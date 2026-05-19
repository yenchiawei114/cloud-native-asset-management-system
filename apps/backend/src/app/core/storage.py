"""Storage 抽象層。

兩個 backend 共用同一組介面，讓 route 程式碼完全不必 import 雲端 SDK。

- `upload` / `delete` 屬於 I/O 操作 → 採 async。
- `get_url` 僅為純字串組合 → 採 sync。保持同步呼叫可讓 caller 直接建立 response model，
  不必將 `await` 擴散到各層。
"""

import asyncio
from abc import ABC, abstractmethod
from datetime import timedelta
from pathlib import Path

from app.core.config import settings


class Storage(ABC):
    @abstractmethod
    async def upload(self, key: str, data: bytes) -> str: ...

    @abstractmethod
    def get_url(self, key: str) -> str: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...


class LocalStorage(Storage):
    def __init__(self, root: str, base_url: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.base_url = base_url.rstrip("/")

    async def upload(self, key: str, data: bytes) -> str:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
        return key

    def get_url(self, key: str) -> str:
        return f"{self.base_url}/{key}"

    async def delete(self, key: str) -> None:
        path = self.root / key
        if path.exists():
            await asyncio.to_thread(path.unlink)


class GCSStorage(Storage):
    """以 GCS 為後端的 Storage。把同步的 google-cloud-storage 呼叫包在 asyncio.to_thread 中。

    `signed_urls=True` 會簽發短期 V4 signed URL，對於私有 bucket（正式環境常見設定）為必需。
    當 `signed_urls=False` 時會退回 `public_url`，僅適用於 bucket／object 可公開讀取的情境。

    GKE Workload Identity 只有 access token 沒有 private key，無法直接 sign。
    解法：透過 IAM signBlob API，需授予 SA roles/iam.serviceAccountTokenCreator。
    """

    def __init__(self, bucket: str, signed_urls: bool, url_ttl_seconds: int) -> None:
        import google.auth
        import google.auth.transport.requests
        from google.cloud import storage as gcs

        self._credentials, _ = google.auth.default()
        self._auth_request = google.auth.transport.requests.Request()
        self._bucket = gcs.Client(credentials=self._credentials).bucket(bucket)
        self._signed_urls = signed_urls
        self._url_ttl = timedelta(seconds=url_ttl_seconds)

    def _refresh_credentials(self) -> None:
        if not self._credentials.valid:
            self._credentials.refresh(self._auth_request)

    async def upload(self, key: str, data: bytes) -> str:
        blob = self._bucket.blob(key)
        await asyncio.to_thread(blob.upload_from_string, data)
        return key

    def get_url(self, key: str) -> str:
        blob = self._bucket.blob(key)
        if self._signed_urls:
            self._refresh_credentials()
            return blob.generate_signed_url(
                version="v4",
                expiration=self._url_ttl,
                method="GET",
                service_account_email=self._credentials.service_account_email,
                access_token=self._credentials.token,
            )
        return blob.public_url

    async def delete(self, key: str) -> None:
        blob = self._bucket.blob(key)
        await asyncio.to_thread(blob.delete)


def _build() -> Storage:
    if settings.storage_backend == "gcs":
        if not settings.gcs_bucket:
            raise RuntimeError("GCS_BUCKET must be set when STORAGE_BACKEND=gcs")
        return GCSStorage(
            settings.gcs_bucket,
            signed_urls=settings.gcs_signed_urls,
            url_ttl_seconds=settings.gcs_url_ttl_seconds,
        )
    return LocalStorage(settings.storage_local_root, settings.storage_local_base_url)


storage: Storage = _build()
