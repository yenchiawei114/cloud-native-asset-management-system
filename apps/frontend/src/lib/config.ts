// 空字串代表 same-origin（vite dev 會把 /api、/static、/healthz 代理到 backend）。
// 正式環境則由 nginx 注入的 window.__CONFIG__ 提供。
export const API_BASE_URL: string = window.__CONFIG__?.API_BASE_URL ?? "";
