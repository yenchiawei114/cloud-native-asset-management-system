// Runtime config。正式環境中此檔案會在容器啟動時由 nginx 透過 envsubst 重新產生，
// 讓同一個 image 可以適用於不同環境。
window.__CONFIG__ = {
  API_BASE_URL: ""
};
