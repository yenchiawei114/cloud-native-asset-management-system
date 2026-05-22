# 執行
先確保本地資料庫與 Redis 已啟動，然後先 seed 再跑 Locust：

```bash
make infra-up
make seed
cd apps/backend/tests/load
uv run locust
```

預設會用 seed 資料中的管理員帳號登入：

- `EMP202601`
- `iloventuim`

如果你要改帳密，可以用環境變數覆蓋：

```bash
LOCUST_EMPLOYEE_ID=EMP202601 LOCUST_PASSWORD=iloventuim uv run locust
```

# 網頁測試
打開 <http://localhost:8089>

可以設定
- 同時使用者數
- spawn rate (每秒增加幾個 user)
- request pattern (API server)

# CLI 測試
直接用指令跑：
```bash
locust -f locustfile.py --host=http://localhost:8000 --headless -u 100 -r 10 -t 1m
```

如果是第一次跑，建議先補資料：

```bash
make seed
locust -f locustfile.py --host=http://localhost:8000 --headless -u 100 -r 10 -t 1m
```

意思：

- --headless 👉 不開網頁 UI
- -u 100 👉 100 個 virtual users
- -r 10 👉 每秒增加 10 個 user
- -t 1m 👉 跑 1 分鐘