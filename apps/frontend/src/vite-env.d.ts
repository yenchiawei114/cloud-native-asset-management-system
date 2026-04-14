/// <reference types="vite/client" />

declare global {
  interface Window {
    __CONFIG__?: {
      API_BASE_URL?: string;
    };
  }
}

export {};
