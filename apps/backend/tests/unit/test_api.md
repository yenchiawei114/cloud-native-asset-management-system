## 1. 執行前準備

請先確認相關服務（如資料庫）已啟動，接著進入後端目錄：

```bash
cd apps/backend
````

---

## 2. 測試檔案結構

所有 API 測試統一放在：

```
apps/backend/tests/api/
```

目錄結構範例如下：

```text
apps/backend/tests/unit/
├── conftest.py
├── test_auth_api.py
├── test_assets_api.py
└── test_ticket_api.py
```

* `conftest.py`：集中管理共用 fixture 與測試環境設定
* `test_*.py`：各 API 模組的測試案例

---

## 3. 可用 fixture

測試時可直接使用以下 fixture，無需自行建立或重複設定：

* `client`
  FastAPI `TestClient`，已自動 override `get_db`

* `db_session`
  每個測試在獨立 transaction 中執行，結束後自動 rollback

* `override_storage`
  自動替換為 `MockStorage`，避免連線到外部儲存服務

* `seed_user`
  預先建立基礎資料（例如 `QA` 部門與預設管理員 `A00000001`）

👉 一般情況下，你不需要：

* 手動建立 `TestClient`
* 自行 patch storage
* 重複建立測試資料

---

## 4. 撰寫測試

### 4.1 命名規範

* 檔名：`test_*.py`（例如 `test_ticket_api.py`）
* 測試函式：`test_描述行為與預期結果`

範例：

```python
def test_create_ticket_returns_201_with_expected_fields():
```

* helper function 請避免使用 `test_` 前綴：

```python
def _make_token():
    ...
```

---

### 4.2 結構（Arrange / Act / Assert）

建議每個測試遵循 AAA 結構，提升可讀性：

```python
def test_get_ticket_as_owner_returns_200(client):
    # Arrange
    token = _make_token(user_id=1, role="EMPLOYEE")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/tickets/1", headers=headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["id"] == 1
```

---

### 4.3 撰寫原則

* 一個測試只驗證一個行為（單一責任）

* 優先驗證：

  1. HTTP status code
  2. 回傳欄位
  3. 狀態變化（如資料庫內容）

* 需要登入的 API：

  * 使用 helper 建立 token
  * 加入 `Authorization: Bearer <token>`

---

## 5. 執行測試

請在專案根目錄執行：

```bash
uv run pytest
```

常用指令如下：

| 用途          | 指令                                                           |
| ----------- | ------------------------------------------------------------ |
| 執行全部測試      | `uv run pytest -v`                                           |
| 執行 API 測試   | `uv run pytest tests/unit -v`                    |
| 執行單一檔案      | `uv run pytest tests/unit/test_ticket_api.py -v` |
| 執行單一測試      | `uv run pytest path::test_name -v`                           |
| 顯示 print 輸出 | `uv run pytest -s -v`                                        |
| 遇錯即停        | `uv run pytest -x -v`                                        |

---

## 6. 建議開發流程

1. 新增或修改 API
2. 撰寫對應測試（先寫測試再實作更佳）
3. 執行測試確認通過
4. 重構程式並保持測試綠燈

---

透過上述規範，可以確保：

* 測試一致性
* 可讀性
* 維護成本低
