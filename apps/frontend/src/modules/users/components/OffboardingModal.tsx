import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, User, OffboardingChecklist } from '../../../lib/api';

interface Props {
  targetUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'loading' | 'checklist' | 'successor' | 'confirm' | 'progress' | 'success';

export const OffboardingModal: React.FC<Props> = ({ targetUser, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const isInProgress = !!(targetUser.termination_date && targetUser.is_active);

  const [step, setStep] = useState<Step>('loading');
  const [checklist, setChecklist] = useState<OffboardingChecklist | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [allAdmins, setAllAdmins] = useState<User[]>([]);
  const [successor, setSuccessor] = useState<User | null>(null);
  const [successorQuery, setSuccessorQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().split('T')[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    api.getOffboardingChecklist(targetUser.employee_id)
      .then(data => {
        setChecklist(data);
        setStep(data.is_offboarding_in_progress ? 'progress' : 'checklist');
      })
      .catch(err => {
        setLoadError(err.message || t('users.offboarding.failedLoad'));
        setStep(isInProgress ? 'progress' : 'checklist');
      });

    if (!isInProgress) {
      api.listUsers({ role: 'ADMIN', limit: 200 })
        .then(data => setAllAdmins(data.items.filter(u => u.is_active !== false && u.id !== targetUser.id)))
        .catch(() => {});
    }
  }, [targetUser.employee_id, targetUser.id, isInProgress, t]);

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
      setSubmitError(err.message || t('users.offboarding.failedInitiate'));
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
      setSubmitError(err.message || t('users.offboarding.failedFinalize'));
    } finally {
      setSubmitting(false);
    }
  };

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
                  {isInProgress ? t('users.offboarding.inProgressTitle') : t('users.offboarding.initiationTitle')}
                </h2>
                <p className="text-xs text-outline font-medium">
                  {targetUser.name}（{targetUser.employee_id}）
                  {targetUser.termination_date && (
                    <span className="ml-2 text-amber-600">{t('users.offboarding.terminationDateLabel', { date: targetUser.termination_date })}</span>
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
              <p className="text-sm text-outline">{t('users.offboarding.loading')}</p>
            </div>
          )}

          {/* Progress view */}
          {step === 'progress' && (
            <div className="space-y-4">
              {loadError && (
                <div className="bg-error-container/20 border border-error/30 rounded-xl p-4 text-sm text-error">{loadError}</div>
              )}

              {checklist && (
                <>
                  {checklist.offboarding_transfers.length > 0 ? (
                    <div className="border border-outline-variant/15 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low/50">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm text-outline">inventory_2</span>
                          <span className="text-sm font-bold text-on-surface">{t('users.offboarding.assetTransferProgress')}</span>
                        </div>
                        <span className="text-xs font-bold text-outline">
                          {t('users.offboarding.completedCount', {
                            done: checklist.offboarding_transfers.filter(tr => tr.status === 'COMPLETED').length,
                            total: checklist.offboarding_transfers.length,
                          })}
                        </span>
                      </div>
                      <ul className="divide-y divide-outline-variant/10">
                        {checklist.offboarding_transfers.map(tr => (
                          <li key={tr.transfer_id} className="px-4 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-on-surface truncate">{tr.asset_name}</p>
                              <p className="text-xs text-outline font-mono">{tr.asset_code}</p>
                              <p className="text-xs text-on-surface-variant mt-0.5">
                                {tr.to_owner_name}（{tr.to_owner_employee_id}）
                              </p>
                            </div>
                            {tr.status === 'COMPLETED' ? (
                              <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                {t('users.offboarding.completed')}
                              </span>
                            ) : (
                              <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                                <span className="material-symbols-outlined text-xs">hourglass_empty</span>
                                {t('users.offboarding.pendingReceive')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="border border-outline-variant/15 rounded-xl px-4 py-3 text-sm text-outline">
                      {t('users.offboarding.noAssetsToTransfer')}
                    </div>
                  )}

                  {!checklist.all_transfers_complete && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                      <span className="material-symbols-outlined text-amber-600 text-lg shrink-0">info</span>
                      <p className="text-xs text-amber-800">
                        {t('users.offboarding.waitForAllTransfers')}
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

          {/* Checklist */}
          {step === 'checklist' && (
            <div className="space-y-4">
              {loadError && (
                <div className="bg-error-container/20 border border-error/30 rounded-xl p-4 text-sm text-error">{loadError}</div>
              )}

              {checklist?.hard_blocker_reason && (
                <div className="bg-error-container/20 border border-error/30 rounded-xl p-4 flex gap-3">
                  <span className="material-symbols-outlined text-error text-lg shrink-0">block</span>
                  <div>
                    <p className="text-sm font-bold text-error mb-1">{t('users.offboarding.cannotProceed')}</p>
                    <p className="text-xs text-error/80">{checklist.hard_blocker_reason}</p>
                  </div>
                </div>
              )}

              {checklist && (
                <>
                  <ChecklistSection
                    icon="inventory_2"
                    label={t('users.offboarding.ownedAssets')}
                    count={checklist.owned_assets.length}
                    note={t('users.offboarding.ownedNote')}
                    items={checklist.owned_assets.map(a => `${a.name}（${a.asset_code}）— ${t(`users.statusLabel.${a.status}`, { defaultValue: a.status })}`)}
                    emptyLabel={t('users.offboarding.noAssets')}
                  />
                  <ChecklistSection
                    icon="build"
                    label={t('users.offboarding.inProgressTickets')}
                    count={checklist.in_progress_tickets.length}
                    note={t('users.offboarding.ticketsNote')}
                    items={checklist.in_progress_tickets.map(tk => `#${tk.id} ${tk.description}${tk.has_loaner ? t('users.offboarding.hasLoaner') : ''} — ${t(`users.statusLabel.${tk.status}`, { defaultValue: tk.status })}`)}
                    emptyLabel={t('users.offboarding.noTickets')}
                    accent="amber"
                  />
                  <ChecklistSection
                    icon="devices"
                    label={t('users.offboarding.borrowedLoaners')}
                    count={checklist.borrowed_loaners.length}
                    note={t('users.offboarding.borrowersNote')}
                    items={checklist.borrowed_loaners.map(a => `${a.name}（${a.asset_code}）`)}
                    emptyLabel={t('users.offboarding.noBorrowed')}
                  />
                  <ChecklistSection
                    icon="swap_horiz"
                    label={t('users.offboarding.pendingTransfers')}
                    count={checklist.pending_transfers.length}
                    note={t('users.offboarding.pendingTransfersNote')}
                    items={checklist.pending_transfers.map(tr => `${tr.asset_name ?? t('common.notSet')}（${tr.asset_code ?? '—'}）`)}
                    emptyLabel={t('users.offboarding.noPendingTransfers')}
                  />
                  <ChecklistSection
                    icon="receipt_long"
                    label={t('users.offboarding.openTickets')}
                    count={checklist.open_tickets.length}
                    note={t('users.offboarding.openTicketsNote')}
                    items={checklist.open_tickets.map(tk => `#${tk.id} ${tk.description}`)}
                    emptyLabel={t('users.offboarding.noOpenTickets')}
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
                  <>{t('users.offboarding.ownedAssetsPrefix')}<span className="font-bold text-on-surface">{checklist?.owned_assets.length}</span>{t('users.offboarding.ownedAssetsSuffix')}</>
                )}
                {(checklist?.in_progress_tickets.length ?? 0) > 0 && (
                  <>{t('users.offboarding.ticketsPrefix')}<span className="font-bold text-on-surface">{checklist?.in_progress_tickets.length}</span>{t('users.offboarding.ticketsSuffix')}</>
                )}
                {(checklist?.borrowed_loaners.length ?? 0) > 0 && (
                  <>{t('users.offboarding.loanersPrefix')}<span className="font-bold text-on-surface">{checklist?.borrowed_loaners.length}</span>{t('users.offboarding.loanersSuffix')}</>
                )}
                {t('users.offboarding.selectReceiverPrompt')}
              </p>
              <div className="space-y-1" ref={dropdownRef}>
                <label className="text-[10px] font-black uppercase tracking-widest text-outline">{t('users.offboarding.receivingAdmin')}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={successor ? `${successor.name}（${successor.employee_id}）` : successorQuery}
                    onChange={e => { setSuccessorQuery(e.target.value); setSuccessor(null); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder={t('users.offboarding.searchAdmin')}
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
                          <span className="ml-auto text-[10px] font-bold bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full">{t('users.offboarding.adminBadge')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="bg-surface-container-low/50 rounded-xl p-4 space-y-1">
                <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">{t('users.offboarding.assetsToTransfer')}</p>
                {checklist?.owned_assets.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-outline">inventory_2</span>
                    {a.name}（{a.asset_code}）
                    {a.status === 'MAINTENANCE' && <span className="text-amber-600 font-bold">{t('users.offboarding.maintenanceStatus')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm */}
          {step === 'confirm' && checklist && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-outline">{t('users.offboarding.offboardDate')}</label>
                <input
                  type="date"
                  value={terminationDate}
                  onChange={e => setTerminationDate(e.target.value)}
                  className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="bg-surface-container-low rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-black text-outline uppercase tracking-widest mb-3">{t('users.offboarding.actionAfterInitiation')}</p>
                <SummaryRow
                  icon="inventory_2"
                  label={t('users.offboarding.initiateAssetTransfer')}
                  value={checklist.owned_assets.length > 0
                    ? `${checklist.owned_assets.length} ${t('users.offboarding.transferTo')} ${successor?.name ?? '—'}${t('users.offboarding.receiverSuffix')}`
                    : t('users.offboarding.noAssetsTransfer')}
                />
                <SummaryRow
                  icon="build"
                  label={t('users.offboarding.handoverTickets')}
                  value={checklist.in_progress_tickets.length > 0
                    ? `${checklist.in_progress_tickets.length} ${t('users.offboarding.transferTo')} ${successor?.name ?? '—'}`
                    : t('users.offboarding.noTicketsHandover')}
                />
                <SummaryRow
                  icon="devices"
                  label={t('users.offboarding.handoverBorrowed')}
                  value={checklist.borrowed_loaners.length > 0
                    ? `${checklist.borrowed_loaners.length} ${t('users.offboarding.transferTo')} ${successor?.name ?? '—'}`
                    : t('users.offboarding.noBorrowedHandover')}
                />
                <SummaryRow
                  icon="receipt_long"
                  label={t('users.offboarding.cancelTickets')}
                  value={checklist.open_tickets.length > 0 ? String(checklist.open_tickets.length) : t('users.offboarding.noCancelTickets')}
                />
                <SummaryRow
                  icon="swap_horiz"
                  label={t('users.offboarding.cancelPendingTransfers')}
                  value={checklist.pending_transfers.length > 0 ? String(checklist.pending_transfers.length) : t('users.offboarding.noCancelPending')}
                />
                <div className="pt-2 border-t border-outline-variant/10 mt-2">
                  <SummaryRow
                    icon="info"
                    label={t('users.offboarding.accountStatus')}
                    value={checklist.owned_assets.length > 0
                      ? t('users.offboarding.accountDisableAfterTransfer')
                      : t('users.offboarding.accountDisableDate', { date: terminationDate })}
                    accent
                  />
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
                  <p className="text-lg font-black text-on-surface mb-1">{t('users.offboarding.successCompleted')}</p>
                  <p className="text-sm text-outline">{t('users.offboarding.accountDisabled', { name: targetUser.name })}</p>
                </div>
              ) : (checklist?.owned_assets.length ?? 0) > 0 ? (
                <div>
                  <p className="text-lg font-black text-on-surface mb-1">{t('users.offboarding.successInitiated')}</p>
                  <p className="text-sm text-outline">
                    {t('users.offboarding.initiatedDesc1')}<br />
                    {t('users.offboarding.initiatedDesc2', { name: successor?.name })}<br />
                    {t('users.offboarding.initiatedDesc3')}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-black text-on-surface mb-1">{t('users.offboarding.successCompleted2')}</p>
                  <p className="text-sm text-outline">{t('users.offboarding.accountDisabled', { name: targetUser.name })}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex justify-end gap-3">
          {step === 'success' ? (
            <button onClick={onClose} className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl">{t('users.offboarding.close')}</button>

          ) : step === 'progress' ? (
            <>
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">{t('users.offboarding.close')}</button>
              <button
                onClick={handleFinalize}
                disabled={submitting || !checklist?.all_transfers_complete}
                title={!checklist?.all_transfers_complete ? t('users.offboarding.waitForTransfers') : undefined}
                className="px-6 py-2.5 bg-error text-white text-sm font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
              >
                {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('users.offboarding.confirmOffboard')}
              </button>
            </>

          ) : step === 'checklist' ? (
            <>
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">{t('users.offboarding.cancel')}</button>
              {!loadError && (
                <button
                  onClick={handleNextFromChecklist}
                  disabled={!checklist?.can_proceed}
                  className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                >
                  {t('users.offboarding.continue')}
                </button>
              )}
            </>

          ) : step === 'successor' ? (
            <>
              <button onClick={() => setStep('checklist')} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">{t('users.offboarding.previous')}</button>
              <button
                onClick={handleNextFromSuccessor}
                disabled={needsSuccessor && !successor}
                className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('users.offboarding.continue')}
              </button>
            </>

          ) : step === 'confirm' ? (
            <>
              <button onClick={() => setStep(needsSuccessor ? 'successor' : 'checklist')} className="px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">{t('users.offboarding.previous')}</button>
              <button
                onClick={handleInitiate}
                disabled={submitting || !terminationDate}
                className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl disabled:opacity-40 flex items-center gap-2"
              >
                {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('users.offboarding.initiateOffboard')}
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
