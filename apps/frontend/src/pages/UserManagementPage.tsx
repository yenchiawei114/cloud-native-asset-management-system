import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "../modules/dashboard/components/DashboardLayout";
import { useUsers } from "../modules/users/hooks/useUsers";
import { useAuth } from "../modules/auth/hooks/useAuth";
import { FeedbackDialog } from "../modules/core/components/FeedbackDialog";
import { useFeedback } from "../modules/core/hooks/useFeedback";
import { api, User, Department, OfficeLocation } from "../lib/api";
import { OffboardingModal } from "../modules/users/components/OffboardingModal";
import { fmtDate } from "../lib/locale";


const inlineCls =
  "w-full bg-surface-container-highest rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary";
const inlineSelectCls = `${inlineCls} min-w-[140px]`;

interface FilterDraft {
  employee_id: string;
  name: string;
  email: string;
  sex: string;
  department_id: string;
  location: string;
  role: string;
  must_change_password: string;
}

const EMPTY_FILTER: FilterDraft = {
  employee_id: "",
  name: "",
  email: "",
  sex: "",
  department_id: "",
  location: "",
  role: "",
  must_change_password: "",
};

export const UserManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { users, loading, refresh } = useUsers();
  const { user: currentUser } = useAuth();
  const { feedbackState, closeFeedback } = useFeedback();

  const isOtherAdmin = (u: User) =>
    u.role === "ADMIN" && u.employee_id !== currentUser?.employee_id;

  const [departments, setDepartments] = useState<Department[]>([]);
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);

  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTER);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTER);

  const [offboardingTarget, setOffboardingTarget] = useState<User | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<
    Record<string, Record<string, any>>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    Promise.all([api.getDepartments(), api.getOfficeLocations()])
      .then(([depts, locs]) => {
        setDepartments(depts);
        setOfficeLocations(locs);
      })
      .catch(() => {});
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchId =
        !applied.employee_id ||
        u.employee_id.toLowerCase().includes(applied.employee_id.toLowerCase());
      const matchName =
        !applied.name ||
        u.name.toLowerCase().includes(applied.name.toLowerCase());
      const matchEmail =
        !applied.email ||
        u.email.toLowerCase().includes(applied.email.toLowerCase());
      const matchSex = !applied.sex || u.sex === applied.sex;
      const matchDept =
        !applied.department_id ||
        String(u.department_id) === applied.department_id;
      const matchLoc =
        !applied.location || (u.location ?? "") === applied.location;
      const matchRole = !applied.role || u.role === applied.role;
      const matchPw =
        !applied.must_change_password ||
        (applied.must_change_password === "yes"
          ? u.must_change_password
          : !u.must_change_password);
      return (
        matchId &&
        matchName &&
        matchEmail &&
        matchSex &&
        matchDept &&
        matchLoc &&
        matchRole &&
        matchPw
      );
    });
  }, [users, applied]);

  const handleSearch = () => setApplied({ ...draft });
  const handleClear = () => {
    setDraft(EMPTY_FILTER);
    setApplied(EMPTY_FILTER);
  };
  const setDraftField = (key: keyof FilterDraft, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setFieldEdit = (employeeId: string, field: string, value: any) =>
    setPendingEdits((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? {}), [field]: value },
    }));

  const getFieldValue = (user: User, field: keyof User) => {
    const edited = pendingEdits[user.employee_id];
    return edited && field in edited ? edited[field] : user[field];
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const results = await Promise.allSettled(
        Object.entries(pendingEdits).map(([empId, edits]) =>
          api.updateUser(empId, edits),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) setSaveError(t('users.management.saveFailed', { count: failed }));
      setPendingEdits({});
      setEditMode(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setPendingEdits({});
    setSaveError("");
  };

  const editCount = Object.keys(pendingEdits).length;
  const getDeptName = (id: number) =>
    departments.find((d) => d.id === id)?.name ?? String(id);

  const inputCls =
    "w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none";
  const selectCls =
    "w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none";
  const labelCls =
    "text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1";

  return (
    <DashboardLayout activeTab="users">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t("auth.nav.userManagement")}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {editMode ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    save
                  </span>
                  {saving
                    ? t('common.saving')
                    : editCount > 0
                      ? t('assets.saveBtnWithCount', { count: editCount })
                      : t('assets.saveBtn')}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">
                    edit
                  </span>
                  {t('assets.editBtn')}
                </button>
                <button
                  onClick={() => navigate("/users/new")}
                  className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-md font-bold text-sm shadow-lg shadow-primary/20 flex items-center space-x-2 transform transition-transform active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    person_add
                  </span>
                  <span>{t("profile.addUser")}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {saveError && (
          <div className="bg-error-container/20 border border-error/30 rounded-lg px-4 py-2 text-sm text-error font-medium">
            {saveError}
          </div>
        )}

        {/* Search Panel */}
        <section className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 space-y-3">
          {/* 文字搜尋 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{t('profile.employeeId')}</label>
              <input
                value={draft.employee_id}
                onChange={(e) => setDraftField("employee_id", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={inputCls}
                placeholder=""
              />
            </div>
            <div>
              <label className={labelCls}>{t('profile.name')}</label>
              <input
                value={draft.name}
                onChange={(e) => setDraftField("name", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={inputCls}
                placeholder=""
              />
            </div>
            <div>
              <label className={labelCls}>{t('profile.email')}</label>
              <input
                value={draft.email}
                onChange={(e) => setDraftField("email", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={inputCls}
                placeholder=""
              />
            </div>
          </div>

          {/* 下拉篩選 + 按鈕 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className={labelCls}>{t('profile.gender')}</label>
              <select
                value={draft.sex}
                onChange={(e) => setDraftField("sex", e.target.value)}
                className={selectCls}
              >
                <option value="">{t('users.management.filterAll')}</option>
                <option value="MALE">{t('users.management.filterMale')}</option>
                <option value="FEMALE">{t('users.management.filterFemale')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('profile.department')}</label>
              <select
                value={draft.department_id}
                onChange={(e) => setDraftField("department_id", e.target.value)}
                className={selectCls}
              >
                <option value="">{t('users.management.filterAll')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('profile.officeLocation')}</label>
              <select
                value={draft.location}
                onChange={(e) => setDraftField("location", e.target.value)}
                className={selectCls}
              >
                <option value="">{t('users.management.filterAll')}</option>
                {officeLocations.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('users.detail.roleLabel')}</label>
              <select
                value={draft.role}
                onChange={(e) => setDraftField("role", e.target.value)}
                className={selectCls}
              >
                <option value="">{t('users.management.filterAll')}</option>
                <option value="ADMIN">{t('users.management.filterAdmin')}</option>
                <option value="EMPLOYEE">{t('users.management.filterEmployee')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('users.management.filterMustChangePwd')}</label>
              <select
                value={draft.must_change_password}
                onChange={(e) =>
                  setDraftField("must_change_password", e.target.value)
                }
                className={selectCls}
              >
                <option value="">{t('users.management.filterAll')}</option>
                <option value="yes">{t('users.management.filterYes')}</option>
                <option value="no">{t('users.management.filterNo')}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="flex-1 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">
                  search
                </span>
                {t('common.search')}
              </button>
              <button
                onClick={handleClear}
                className="flex-1 py-2 bg-surface-container-highest text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">
                  clear_all
                </span>
                {t('assets.clearAll')}
              </button>
            </div>
          </div>
        </section>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-max w-full text-left border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-surface-container-low/50 text-[11px] font-extrabold text-outline uppercase tracking-widest">
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t("profile.employeeId")}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t("profile.name")}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t("profile.email")}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t('users.management.colSex')}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t('users.management.colDept')}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t('users.management.colLocation')}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t("profile.role")}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t('users.management.colMustChangePwd')}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t('users.management.colCreatedAt')}
                  </th>
                  <th className="px-4 py-4 border-b border-outline-variant/10">
                    {t('dashboard.table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-20 text-center">
                      <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                    </td>
                  </tr>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const isDirty = !!pendingEdits[user.employee_id];
                    return (
                      <tr
                        key={user.id}
                        className={`transition-colors group ${isDirty ? "bg-amber-50 border-l-2 border-amber-400" : "hover:bg-surface-container-low"}`}
                      >
                        {/* 工號（唯讀） */}
                        <td className="px-4 py-3 font-mono font-bold text-outline group-hover:text-primary transition-colors whitespace-nowrap">
                          {user.employee_id}
                        </td>

                        {/* 姓名 */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {editMode && !isOtherAdmin(user) ? (
                            <input
                              value={String(getFieldValue(user, "name") ?? "")}
                              onChange={(e) =>
                                setFieldEdit(user.employee_id, "name", e.target.value)
                              }
                              className={inlineCls}
                            />
                          ) : (
                            <div className="flex items-center space-x-3">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${user.role === "ADMIN" ? "bg-primary-container text-on-primary-container" : "bg-surface-container-highest text-on-surface"} ${user.is_active === false ? "opacity-40" : ""}`}
                              >
                                {user.name.charAt(0)}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold ${user.is_active === false ? "text-outline line-through" : "text-on-surface"}`}>
                                  {user.name}
                                </span>
                                {user.is_active === false && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 bg-error/10 text-error rounded-full border border-error/20">{t('users.detail.offboarded')}</span>
                                )}
                                {user.is_active && user.termination_date && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-300">{t('users.management.offboarding')}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">
                          {editMode && !isOtherAdmin(user) ? (
                            <input
                              type="email"
                              value={String(getFieldValue(user, "email") ?? "")}
                              onChange={(e) =>
                                setFieldEdit(user.employee_id, "email", e.target.value)
                              }
                              className={inlineCls}
                            />
                          ) : (
                            user.email
                          )}
                        </td>

                        {/* 性別 */}
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">
                          {editMode && !isOtherAdmin(user) ? (
                            <select
                              value={String(getFieldValue(user, "sex") ?? "MALE")}
                              onChange={(e) =>
                                setFieldEdit(user.employee_id, "sex", e.target.value)
                              }
                              className={inlineSelectCls}
                            >
                              <option value="MALE">{t('users.detail.sexMale')}</option>
                              <option value="FEMALE">{t('users.detail.sexFemale')}</option>
                            </select>
                          ) : (
                            user.sex === 'MALE' ? t('users.detail.sexMale') : user.sex === 'FEMALE' ? t('users.detail.sexFemale') : user.sex
                          )}
                        </td>

                        {/* 部門 */}
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">
                          {editMode && !isOtherAdmin(user) ? (
                            <select
                              value={String(
                                getFieldValue(user, "department_id") ?? user.department_id
                              )}
                              onChange={(e) =>
                                setFieldEdit(user.employee_id, "department_id", Number(e.target.value))
                              }
                              className={inlineSelectCls}
                            >
                              {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          ) : (
                            getDeptName(user.department_id)
                          )}
                        </td>

                        {/* 辦公地點 */}
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">
                          {editMode && !isOtherAdmin(user) ? (
                            <select
                              value={String(
                                getFieldValue(user, "location") ?? user.location ?? ""
                              )}
                              onChange={(e) =>
                                setFieldEdit(user.employee_id, "location", e.target.value)
                              }
                              className={inlineSelectCls}
                            >
                              <option value="">—</option>
                              {officeLocations.map((l) => (
                                <option key={l.id} value={l.name}>{l.name}</option>
                              ))}
                            </select>
                          ) : (
                            user.location ?? "—"
                          )}
                        </td>

                        {/* 系統角色（唯讀） */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${user.role === "ADMIN" ? "bg-primary-container text-on-primary-container" : "bg-surface-container-highest text-on-surface-variant"}`}
                          >
                            {user.role === "ADMIN"
                              ? t("profile.admin")
                              : t("profile.employee")}
                          </span>
                        </td>

                        {/* 須改密碼 */}
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          {user.must_change_password ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                              {t('users.management.mustChangePwdYes')}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant/40 text-xs">
                              —
                            </span>
                          )}
                        </td>

                        {/* 建立時間 */}
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant text-xs font-mono">
                          {fmtDate(user.created_at)}
                        </td>

                        {/* 操作 */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {user.role === "EMPLOYEE" &&
                            user.is_active !== false &&
                            !user.termination_date &&
                            user.employee_id !== currentUser?.employee_id && (
                              <button
                                onClick={() => setOffboardingTarget(user)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-error bg-error/10 hover:bg-error/20 rounded-lg transition-colors active:scale-95"
                              >
                                <span className="material-symbols-outlined text-xs">person_off</span>
                                {t('users.management.offboardBtn')}
                              </button>
                            )}
                          {user.role === "EMPLOYEE" &&
                            user.is_active &&
                            user.termination_date && (
                              <button
                                onClick={() => setOffboardingTarget(user)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors active:scale-95"
                              >
                                <span className="material-symbols-outlined text-xs">pending_actions</span>
                                {t('users.management.viewProgress')}
                              </button>
                            )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="py-20 text-center text-outline">
                      <span className="material-symbols-outlined text-5xl mb-2 block">
                        person_off
                      </span>
                      <p>{t("profile.noUsersFound")}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <FeedbackDialog
        {...feedbackState}
        onConfirm={() => {
          feedbackState.onConfirm?.();
          if (feedbackState.type !== "confirm") closeFeedback();
        }}
        onCancel={closeFeedback}
      />

      {offboardingTarget && (
        <OffboardingModal
          targetUser={offboardingTarget}
          onClose={() => setOffboardingTarget(null)}
          onSuccess={() => refresh()}
        />
      )}
    </DashboardLayout>
  );
};
