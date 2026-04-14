import { useEffect, useState } from "react";
import { api } from "./lib/api";

type Status = { kind: "loading" } | { kind: "ok"; text: string } | { kind: "err"; text: string };

export default function App() {
  const [health, setHealth] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    api
      .readyz()
      .then((r) => setHealth({ kind: "ok", text: r.status }))
      .catch((e) => setHealth({ kind: "err", text: String(e) }));
  }, []);

  return (
    <main>
      <h1>Asset Management</h1>

      <section>
        <h2>Backend</h2>
        {health.kind === "loading" && <span className="status-pill">checking…</span>}
        {health.kind === "ok" && <span className="status-pill">backend {health.text}</span>}
        {health.kind === "err" && <span className="status-pill error">{health.text}</span>}
      </section>
    </main>
  );
}
