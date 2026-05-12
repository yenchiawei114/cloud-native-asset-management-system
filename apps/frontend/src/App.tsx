import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { EmployeeDashboard } from "./pages/EmployeeDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { UserManagementPage } from "./pages/UserManagementPage";
import { UserCreatePage } from "./pages/UserCreatePage";
import { TicketReviewPage } from "./pages/TicketReviewPage";
import { AssetCreatePage } from "./pages/AssetCreatePage";
import { RepairHistory } from "./pages/RepairHistory";
import { ProfilePage } from "./pages/ProfilePage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { AuditLogDetailPage } from "./pages/AuditLogDetailPage";
import { UserDetailPage } from "./pages/UserDetailPage";
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
  const { isAuthenticated, initialized, user } = useAuth();

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route path="/dashboard" element={
        isAuthenticated
          ? (isAdmin ? <Navigate to="/all-assets" replace /> : <EmployeeDashboard />)
          : <Navigate to="/login" replace />
      } />
      <Route path="/all-assets" element={
        isAuthenticated && isAdmin ? <AdminDashboard /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/users" element={
        isAuthenticated && isAdmin ? <UserManagementPage /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/users/new" element={
        isAuthenticated && isAdmin ? <UserCreatePage /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/users/:employeeId" element={
        isAuthenticated && isAdmin ? <UserDetailPage /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/ticket-review" element={
        isAuthenticated && isAdmin ? <TicketReviewPage /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/audit-logs" element={
        isAuthenticated && isAdmin ? <AuditLogPage /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/audit-logs/:id" element={
        isAuthenticated && isAdmin ? <AuditLogDetailPage /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/all-assets/new" element={
        isAuthenticated && isAdmin ? <AssetCreatePage /> : <Navigate to="/dashboard" replace />
      } />
      <Route path="/repair-history" element={isAuthenticated ? <RepairHistory /> : <Navigate to="/login" replace />} />
      <Route path="/repair-history/:id" element={isAuthenticated ? <TicketDetailPage /> : <Navigate to="/login" replace />} />
      <Route path="/assets/:id" element={isAuthenticated ? <AssetDetailPage /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={isAuthenticated ? <ProfilePage /> : <Navigate to="/login" replace />} />
      <Route path="/status" element={<SystemStatus />} />
      <Route path="/" element={<Navigate to={isAuthenticated ? (isAdmin ? "/all-assets" : "/dashboard") : "/login"} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
