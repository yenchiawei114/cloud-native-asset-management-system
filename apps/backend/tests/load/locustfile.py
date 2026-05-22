import os

from locust import HttpUser, task, between
from pathlib import Path
import sys

root_dir = str(Path(__file__).resolve().parents[2])

# 將該路徑加入 sys.path (加上判斷避免重複加入)
if root_dir not in sys.path:
    sys.path.append(root_dir)
from scripts.seed import USERS as seed_users


class APIUser(HttpUser):
    """Locust user that logs in and hits a few API endpoints.

    - on_start: POST /api/login to obtain bearer token
    - tasks:  /api/assets, /api/tickets
    """

    host = os.getenv("LOCUST_HOST", "http://localhost:8000")
    wait_time = between(1, 3)

    credential_candidates = [(user.get("employee_id"), user.get("password")) for user in seed_users]

    def on_start(self):
        self.headers = {}
        last_error = None

        for employee_id, password in self.credential_candidates:
            if not employee_id or not password:
                continue

            payload = {"employee_id": employee_id, "password": password}
            with self.client.post("/api/login", json=payload, catch_response=True) as res:
                if res.status_code != 200:
                    last_error = f"employee_id={employee_id} (status={res.status_code})"
                    continue

                try:
                    token = res.json().get("access_token")
                except Exception:
                    token = None

                if token:
                    self.headers = {"Authorization": f"Bearer {token}"}
                    return

                last_error = f"employee_id={employee_id} (missing access_token)"

        # raise StopUser(f"Login failed for all credential candidates: {last_error}")

    @task
    def list_assets(self):
        self.client.get("/api/assets", headers=self.headers)

    @task
    def get_asset(self):
        self.client.get("/api/tickets", headers=self.headers)
