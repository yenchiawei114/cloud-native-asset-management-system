import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { EmployeeDashboard } from "./pages/EmployeeDashboard";
import { RepairHistory } from "./pages/RepairHistory";
import { ProfilePage } from "./pages/ProfilePage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { useAuth } from "./modules/auth/hooks/useAuth";

type Status = { kind: "loading" } | { kind: "ok"; text: string } | { kind: "err"; text: string };

function SystemStatus() {
  const [health, setHealth] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    api.healthz()
      .then(r => setHealth({ kind: "ok", text: r.status }))
      .catch(e => setHealth({ kind: "err", text: e.message }));
  }, []);

  return (
    <div className="p-8">
      <main className="max-w-2xl mx-auto p-8 bg-surface rounded-xl border border-outline-variant/30 shadow-sm relative z-50">
        <h1 className="text-2xl font-bold mb-6 text-on-surface">Asset Management System Status</h1>
        <section className="p-4 bg-surface-container rounded-lg border border-outline-variant/20">
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">Backend Connection</h2>
          {health.kind === "loading" && <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-primary/10 text-primary">Checking...</span>}
          {health.kind === "ok" && <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-green-500/10 text-green-600">Backend {health.text}</span>}
          {health.kind === "err" && <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-error/10 text-error">{health.text}</span>}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, initialized } = useAuth();

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route path="/dashboard" element={isAuthenticated ? <EmployeeDashboard /> : <Navigate to="/login" replace />} />
      <Route path="/repair-history" element={isAuthenticated ? <RepairHistory /> : <Navigate to="/login" replace />} />
      <Route path="/repair-history/:id" element={isAuthenticated ? <TicketDetailPage /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={isAuthenticated ? <ProfilePage /> : <Navigate to="/login" replace />} />
      <Route path="/status" element={<SystemStatus />} />
      <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
