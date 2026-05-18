import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Asset, RepairRequest } from '../../../lib/api';

interface Props {
  ticket: RepairRequest | null;
  onClose: () => void;
  onApproved: () => void;
}

export const ApproveTicketDialog: React.FC<Props> = ({ ticket, onClose, onApproved }) => {
  const { t } = useTranslation();
  const [expectedDate, setExpectedDate] = useState('');
  const [loanerAsset, setLoanerAsset] = useState<Asset | null>(null);
  const [searchText, setSearchText] = useState('');
  const [idleAssets, setIdleAssets] = useState<Asset[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<Asset[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticket) return;
    setExpectedDate('');
    setLoanerAsset(null);
    setSearchText('');
    setError('');
    if (ticket.need_backup) {
      setLoadingAssets(true);
      api.listMyIdleAssets()
        .then(data => { setIdleAssets(data); setFilteredAssets(data); })
        .catch(() => { setIdleAssets([]); setFilteredAssets([]); })
        .finally(() => setLoadingAssets(false));
    }
  }, [ticket]);

  useEffect(() => {
    const q = searchText.toLowerCase();
    setFilteredAssets(
      q ? idleAssets.filter(a =>
        a.asset_code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
      ) : idleAssets
    );
  }, [searchText, idleAssets]);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectAsset = (asset: Asset) => {
    setLoanerAsset(asset);
    setSearchText(`${asset.asset_code} — ${asset.name}`);
    setDropdownOpen(false);
  };

  const clearLoaner = () => {
    setLoanerAsset(null);
    setSearchText('');
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;
    if (ticket.need_backup && !loanerAsset) {
      setError(t('ticketing.backupRequired'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.approveTicket(
        ticket.id,
        expectedDate || undefined,
        loanerAsset ? loanerAsset.id : null,
      );
      onApproved();
      onClose();
    } catch (err: any) {
      setError(err.message || t('common.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!ticket) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <h2 className="text-base font-bold text-on-surface">{t('ticketing.approveDialogTitle')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-on-surface-variant">
            {t('ticketing.approveDialogDescPre')} <span className="font-bold text-primary">#TKT-{String(ticket.id).padStart(4, '0')}</span>{t('ticketing.approveDialogDescPost')}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">
              {t('ticketing.detail.expectedDate')} <span className="text-on-surface-variant/60 font-normal">{t('ticketing.optional')}</span>
            </label>
            <input
              type="date"
              value={expectedDate}
              onChange={e => setExpectedDate(e.target.value)}
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>

          {ticket.need_backup && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-amber-500">devices</span>
                {t('ticketing.loanerAssetLabel')} <span className="text-error">*</span>
                <span className="text-on-surface-variant/50 font-normal text-[10px]">{t('ticketing.loanerAssetRestriction')}</span>
              </label>

              {loadingAssets ? (
                <p className="text-xs text-on-surface-variant/60 py-2">{t('ticketing.loadingAssets')}</p>
              ) : (
                <div className="relative" ref={dropdownRef}>
                  <div className="flex items-center gap-1 bg-surface-container-highest rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-sm text-on-surface-variant/60">search</span>
                    <input
                      ref={inputRef}
                      type="text"
                      value={searchText}
                      onChange={e => {
                        setSearchText(e.target.value);
                        setLoanerAsset(null);
                        setDropdownOpen(true);
                      }}
                      onFocus={() => setDropdownOpen(true)}
                      placeholder=""
                      className="flex-1 bg-transparent border-none text-sm focus:ring-0 outline-none min-w-0"
                    />
                    {loanerAsset && (
                      <button type="button" onClick={clearLoaner} className="p-0.5 hover:text-error transition-colors">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    )}
                  </div>

                  {dropdownOpen && filteredAssets.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-surface rounded-lg shadow-lg border border-outline-variant/20 max-h-48 overflow-y-auto">
                      {filteredAssets.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-surface-container transition-colors text-sm"
                          onMouseDown={() => selectAsset(a)}
                        >
                          <span className="font-mono text-primary font-bold text-xs">{a.asset_code}</span>
                          <span className="text-on-surface ml-2">{a.name}</span>
                          {a.model && <span className="text-on-surface-variant/60 ml-1 text-xs">({a.model})</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {dropdownOpen && filteredAssets.length === 0 && searchText && (
                    <div className="absolute z-10 w-full mt-1 bg-surface rounded-lg shadow-lg border border-outline-variant/20 px-3 py-2">
                      <p className="text-xs text-on-surface-variant/60">{t('ticketing.noAssetsFound')}</p>
                    </div>
                  )}
                </div>
              )}

              {loanerAsset && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="material-symbols-outlined text-sm text-green-600">check_circle</span>
                  <span className="text-xs text-green-700 font-semibold">{t('ticketing.loanerSelected', { code: loanerAsset.asset_code, name: loanerAsset.name })}</span>
                </div>
              )}

              {idleAssets.length === 0 && !loadingAssets && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  {t('ticketing.noIdleAssets')}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || (ticket.need_backup && idleAssets.length === 0 && !loadingAssets)}
              className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? t('common.processing') : t('ticketing.confirmApprove')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
