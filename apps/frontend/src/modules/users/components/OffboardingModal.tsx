import React, { useState, useEffect, useRef } from 'react';
import { api, User, OffboardingChecklist } from '../../../lib/api';

interface Props {
  targetUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'loading' | 'checklist' | 'successor' | 'confirm' | 'progress' | 'success';

const STATUS_LABEL: Record<string, string> = {
  OPEN: '待審核',
  RETURNED: '已退回',
  IN_PROGRESS: '維修中',
  WAITING_LOANER_RETURN: '待歸還備用機',
  IN_USE: '使用中',
  MAINTENANCE: '維修中',
  BORROWED: '已借出',
  AVAILABLE: '閒置',
};

export const OffboardingModal: React.FC<Props> = ({ targetUser, onClose, onSuccess }) => {
  const isInProgress = !!(targetUser.termination_date && targetUser.is_active);

  const [step, setStep] = useState<Step>('loading');
  const [checklist, setChecklist] = useState<OffboardingChecklist | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // initiation fields
  const [allAdmins, setAllAdmins] = useState<User[]>([]);
  const [successor, setSuccessor] = useState<User | null>(null);
  const [successorQuery, setSuccessorQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().split('T')[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    api.getOffboardingChecklist(targetUser.employee_id)
      .then(data => {
        setChecklist(data);
        setStep(data.is_offboarding_in_progress ? 'progress' : 'checklist');
      })
      .catch(err => {
        setLoadError(err.message || '無法載入離職資料');
        setStep(isInProgress ? 'progress' : 'checklist');
      });

    if (!isInProgress) {
      api.listUsers()
        .then(users => setAllAdmins(users.filter(u => u.role === 'ADMIN' && u.is_active !== false && u.id !== targetUser.id)))
        .catch(() => {});
    }
  }, [targetUser.employee_id, targetUser.id, isInProgress]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredAdmins = allAdmins.filter(u => {
    const q = successorQuery.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.employee_id.toLowerCase().includes(q);
  });

  const handleSelectSuccessor = (u: User) => {
    setSuccessor(u);
    setSuccessorQuery('');
    setDropdownOpen(false);
  };

  const handleClearSuccessor = () => {
    setSuccessor(null);
    setSuccessorQuery('');
    setDropdownOpen(false);
  };

  const needsSuccessor =
    (checklist?.owned_assets.length ?? 0) > 0 ||
    (checklist?.in_progress_tickets.length ?? 0) > 0 ||
    (checklist?.borrowed_loaners.length ?? 0) > 0;

  const handleNextFromChecklist = () => {
    if (needsSuccessor) setStep('successor');
    else setStep('confirm');
  };

  const handleNextFromSuccessor = () => {
    if (needsSuccessor && !successor) return;
    setStep('confirm');
  };

  const handleInitiate = async () => {
    if (!checklist) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.offboardUser(targetUser.employee_id, {
        asset_successor_id: successor?.id ?? null,
        termination_date: terminationDate,
      });
      onSuccess();
      setStep('success');
    } catch (err: any) {
      setSubmitError(err.message || '發起離職失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.finalizeOffboarding(targetUser.employee_id);
      onSuccess();
      setStep('success');
    } catch (err: any) {
      setSubmitError(err.message || '確認離職失敗');
    } finally {
      setSubmitting(false);
    }
  };

  // Step indicator for initiation flow
  const initiationSteps = (['checklist', 'successor', 'confirm'] as const).filter(
    s => s !== 'successor' || needsSuccessor
  );
  const currentInitiationIdx = initiationSteps.indexOf(step as any);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg mx-4 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-error text-lg">person_off</span>
              </div>
              <div>
                <h2 className="text-lg font-black text-on-surface">
                  {isInProgress ? '離職進度查看' : '離職流程'}
                </h2>
                <p className="text-xs text-outline font-medium">
                  {targetUser.name}（{targetUser.employee_id}）
                  {targetUser.termination_date && (
                    <span className="ml-2 text-amber-600">離職日：{targetUser.termination_date}</span>
                  )}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors text-outline">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          {/* Step indicator (initiation flow only) */}
          {!isInProgress && step !== 'loading' && step !== 'success' && (
            <div className="flex items-center gap-1 mt-5 mb-0">
              {initiationSteps.map((s, idx) => {
                const done = currentInitiationIdx > idx;
                const active = step === s;
                return (
                  <div
                    key={s}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${done ? 'bg-primary' : active ? 'bg-primary/60' : 'bg-surface-container-high'}`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-8 py-6 max-h-[60vh] overflow-y-auto">

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center py-10 gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-outline">載入中…</p>
            </div>
          )}

          {/* Progress view (離職中) */}
          {step === 'progress' && (
            <div className="space-y-4">
              {loadError && (
                <div className="bg-error-container/20 border border-error/30 rounded-xl p-4 text-sm text-error">{loadError}</div>
              )}

              {checklist && (
                <>
                  {/* Transfer progress */}
                  {checklist.offboarding_transfers.length > 0 ? (
                    <div className="border border-outline-variant/15 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low/50">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm text-outline">inventory_2</span>
                          <span className="text-sm font-bold text-on-surface">資產轉移進度</span>
                        </div>
                        <span className="text-xs font-bold text-outline">
                          {checklist.offboarding_transfers.filter(t => t.status === 'COMPLETED').length}
                          {' / '}
                          {checklist.offboarding_transfers.length} 已完成
                        </span>
                      </div>
                      <ul className="divide-y divide-outline-variant/10">
                        {checklist.offboarding_transfers.map(t => (
                          <li key={t.transfer_id} className="px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-on-surface truncate">{t.asset_name}</p>
                              <p className="text-xs text-outline font-mono">{t.asset_code}</p>
                              <p className="text-xs text-on-surface-variant mt-0.5">
                                接收人：{t.to_owner_name}（{t.to_owner_employee_id}）
                              </p>
                            </div>
                            {t.status === 'COMPLETED' ? (
                              <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                已完成
                              </span>
                            ) : (
                              <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                                <span className="material-symbols-outlined text-xs">hourglass_empty</span>
                                待接收確認
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="border border-outline-variant/15 rounded-xl px-4 py-3 text-sm text-outline">
                      無資產待轉移，可直接確認離職
                    </div>
                  )}

                  {!checklist.all_transfers_complete && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                      <span className="material-symbols-outlined text-amber-600 text-lg shrink-0">info</span>
                      <p className="text-xs text-amber-800">
                        接收人確認所有資產轉移後，「確認離職」按鈕才會啟用。請通知接收人登入系統確認。
                      </p>
                    </div>
                  )}

                  {submitError && (
                    <div className="bg-error-container/20 border border-error/30 rounded-xl p-3 text-xs text-error">{submitError}</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Checklist (initiation flow) */}
          {step === 'checklist' && (
            <div className="space-y-4">
              {loadError && (
                <div className="bg-error-container/20 border border-error/30 rounded-xl p-4 text-sm text-error">{loadError}</div>
              )}

              {checklist?.hard_blocker_reason && (
                <div className="bg-error-container/20 border border-error/30 rounded-xl p-4 flex gap-3">
                  <span className="material-symbols-outlined text-error text-lg shrink-0">block</span>
                  <div>
                    <p className="text-sm font-bold text-error mb-1">無法繼續</p>
                    <p className="text-xs text-error/80">{checklist.hard_blocker_reason}</p>
                  </div>
                </div>
              )}

              {checklist && (
                <>
                  <ChecklistSection
                    icon="inventory_2"
                    label="保管資產"
                    count={checklist.owned_assets.length}
                    note="將發起轉移請求，由接收人確認後完成"
                    items={checklist.owned_assets.map(a => `${a.name}（${a.asset_code}）— ${STATUS_LABEL[a.status] ?? a.status}`)}
                    emptyLabel="無資產"
                  />
                  <ChecklistSection
                    icon="build"
                    label="進行中的維修工單"
                    count={checklist.in_progress_tickets.length}
                    note="工單申請人及備用機借用記錄將移交給接收管理員"
                    items={checklist.in_progress_tickets.map(t => `#${t.id} ${t.description}${t.has_loaner ? '（含備用機）' : ''} — ${STATUS_LABEL[t.status] ?? t.status}`)}
                    emptyLabel="無進行中的維修工單"
                    accent="amber"
                  />
                  <ChecklistSection
                    icon="devices"
                    label="借用中的備用機"
                    count={checklist.borrowed_loaners.length}
                    note="借用人將更新為接收管理員"
                    items={checklist.borrowed_loaners.map(a => `${a.name}（${a.asset_code}）`)}
                    emptyLabel="無借用中的備用機"
                  />
                  <ChecklistSection
                    icon="swap_horiz"
                    label="待確認資產轉移"
                    count={checklist.pending_transfers.length}
                    note="系統將自動取消"
                    items={checklist.pending_transfers.map(t => `${t.asset_name ?? '未知資產'}（${t.asset_code ?? '—'}）`)}
                    emptyLabel="無待確認轉移"
                  />
                  <ChecklistSection
                    icon="receipt_long"
                    label="待審核 / 已退回工單"
                    count={checklist.open_tickets.length}
                    note="系統將自動取消，並記錄離職原因"
                    items={checklist.open_tickets.map(t => `#${t.id} ${t.description}`)}
                    emptyLabel="無未結工單"
                  />
                </>
              )}
            </div>
          )}

          {/* Select Successor */}
          {step === 'successor' && (
            <div className="space-y-4">
              <p className="text-sm text-on-surface-variant">
                {(checklist?.owned_assets.length ?? 0) > 0 && (
                  <>保管 <span className="font-bold text-on-surface">{checklist?.owned_assets.length}</span> 個資產、</>
                )}
                {(checklist?.in_progress_tickets.length ?? 0) > 0 && (
                  <><span className="font-bold text-on-surface">{checklist?.in_progress_tickets.length}</span> 張進行中的維修工單、</>
                )}
                {(checklist?.borrowed_loaners.length ?? 0) > 0 && (
                  <>借用 <span className="font-bold text-on-surface">{checklist?.borrowed_loaners.length}</span> 台備用機、</>
                )}
                請選擇接收的管理員。
              </p>
              <div className="space-y-1" ref={dropdownRef}>
                <label className="text-[10px] font-black uppercase tracking-widest text-outline">接收管理員</label>
                <div className="relative">
                  <input
                    type="text"
                    value={successor ? `${successor.name}（${successor.employee_id}）` : successorQuery}
                    onChange={e => { setSuccessorQuery(e.target.value); setSuccessor(null); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="搜尋管理員姓名或工號…"
                    className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  {(successor || successorQuery) && (
                    <button type="button" onClick={handleClearSuccessor} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                  {dropdownOpen && filteredAdmins.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full bg-surface border border-outline-variant/30 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                      {filteredAdmins.map(u => (
                        <li key={u.id} onMouseDown={() => handleSelectSuccessor(u)} className="px-4 py-2.5 text-sm hover:bg-surface-container cursor-pointer flex items-center gap-2">
                          <span className="font-semibold text-on-surface">{u.name}</span>
                          <span className="text-outline text-xs">{u.employee_id}</span>
                          <span className="ml-auto text-[10px] font-bold bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full">管理員</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="bg-surface-container-low/50 rounded-xl p-4 space-y-1">
                <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">將發起轉移的資產</p>
                {checklist?.owned_assets.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-outline">inventory_2</span>
                    {a.name}（{a.asset_code}）
                    {a.status === 'MAINTENANCE' && <span className="text-amber-600 font-bold">維修中</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm (initiation) */}
          {step === 'confirm' && checklist && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-outline">離職日期</label>
                <input
                  type="date"
                  value={terminationDate}
                  onChange={e => setTerminationDate(e.target.value)}
                  className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="bg-surface-container-low rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-black text-outline uppercase tracking-widest mb-3">發起後將執行</p>
                <SummaryRow icon="inventory_2" label="發起資產轉移" value={checklist.owned_assets.length > 0 ? `${checklist.owned_assets.length} 個 → ${successor?.name ?? '—'}（待接收確認）` : '無資產需轉移'} />
                <SummaryRow icon="build" label="移交維修工單" value={checklist.in_progress_tickets.length > 0 ? `${checklist.in_progress_tickets.length} 張 → ${successor?.name ?? '—'}` : '無進行中工單'} />
                <SummaryRow icon="devices" label="備用機借用移交" value={checklist.borrowed_loaners.length > 0 ? `${checklist.borrowed_loaners.length} 台借用 → ${successor?.name ?? '—'}` : '無借用中備用機'} />
                <SummaryRow icon="receipt_long" label="取消工單" value={checklist.open_tickets.length > 0 ? `${checklist.open_tickets.length} 張（寫入離職原因）` : '無'} />
                <SummaryRow icon="swap_horiz" label="取消待確認轉移" value={checklist.pending_transfers.length > 0 ? `${checklist.pending_transfers.length} 筆` : '無'} />
                <div className="pt-2 border-t border-outline-variant/10 mt-2">
                  <SummaryRow icon="info" label="帳號狀態" value={checklist.owned_assets.length > 0 ? '資產轉移確認後才停用' : `${terminationDate} 起停用`} accent />
                </div>
              </div>

              {submitError && (
                <div className="bg-error-container/20 border border-error/30 rounded-xl p-3 text-xs text-error">{submitError}</div>
              )}
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-8 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              {isInProgress ? (
                <div>
                  <p className="text-lg font-black text-on-surface mb-1">離職已完成</p>
                  <p className="text-sm text-outline">{targetUser.name} 的帳號已停用</p>
                </div>
              ) : (checklist?.owned_assets.length ?? 0) > 0 ? (
                <div>
                  <p className="text-lg font-black text-on-surface mb-1">離職流程已發起</p>
                  <p className="text-sm text-outline">
                    工單已取消，帳號保持啟用中。<br />
                    待 <span className="font-bold text-on-surface">{successor?.name}</span> 確認所有資產轉移後，<br />
                    再回到此頁點擊「確認離職」以完成離職。
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-black text-on-surface mb-1">離職流程已完成</p>
                  <p className="text-sm text-outline">{targetUser.name} 的帳號已停用</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex justify-end gap-3">
          {step === 'success' ? (
            <button onClick={onClose} className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl">關閉</button>

          ) : step === 'progress' ? (
            <>
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">關閉</button>
              <button
                onClick={handleFinalize}
                disabled={submitting || !checklist?.all_transfers_complete}
                title={!checklist?.all_transfers_complete ? '請等待所有資產轉移確認完成後再執行' : undefined}
                className="px-6 py-2.5 bg-error text-white text-sm font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
              >
                {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                確認離職
              </button>
            </>

          ) : step === 'checklist' ? (
            <>
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">取消</button>
              {!loadError && (
                <button
                  onClick={handleNextFromChecklist}
                  disabled={!checklist?.can_proceed}
                  className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                >
                  繼續
                </button>
              )}
            </>

          ) : step === 'successor' ? (
            <>
              <button onClick={() => setStep('checklist')} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">上一步</button>
              <button
                onClick={handleNextFromSuccessor}
                disabled={needsSuccessor && !successor}
                className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                繼續
              </button>
            </>

          ) : step === 'confirm' ? (
            <>
              <button onClick={() => setStep(needsSuccessor ? 'successor' : 'checklist')} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">上一步</button>
              <button
                onClick={handleInitiate}
                disabled={submitting || !terminationDate}
                className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl disabled:opacity-40 flex items-center gap-2"
              >
                {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                發起離職
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const ChecklistSection: React.FC<{
  icon: string;
  label: string;
  count: number;
  note: string;
  items: string[];
  emptyLabel: string;
  accent?: 'amber' | 'default';
}> = ({ icon, label, count, note, items, emptyLabel, accent }) => (
  <div className="border border-outline-variant/15 rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low/50">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sm text-outline">{icon}</span>
        <span className="text-sm font-bold text-on-surface">{label}</span>
        {count > 0 && (
          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${accent === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}>{count}</span>
        )}
      </div>
      {count > 0 && <span className="text-[10px] text-outline italic">{note}</span>}
    </div>
    {count > 0 ? (
      <ul className="divide-y divide-outline-variant/10">
        {items.map((item, i) => (
          <li key={i} className="px-4 py-2 text-xs text-on-surface-variant flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-outline shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    ) : (
      <div className="px-4 py-2 text-xs text-outline italic">{emptyLabel}</div>
    )}
  </div>
);

const SummaryRow: React.FC<{ icon: string; label: string; value: string; accent?: boolean }> = ({ icon, label, value, accent }) => (
  <div className="flex items-center gap-2 text-sm">
    <span className={`material-symbols-outlined text-sm ${accent ? 'text-primary' : 'text-outline'}`}>{icon}</span>
    <span className="text-outline">{label}</span>
    <span className={`ml-auto font-semibold ${accent ? 'text-primary' : 'text-on-surface'}`}>{value}</span>
  </div>
);
