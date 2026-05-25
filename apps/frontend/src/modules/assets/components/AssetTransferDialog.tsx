import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Asset, User } from '../../../lib/api';

interface Props {
  asset: Asset | null;
  onClose: () => void;
  onTransferInitiated: () => void;
}

export const AssetTransferDialog: React.FC<Props> = ({ asset, onClose, onTransferInitiated }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!asset) return;
    api.listUsers({ limit: 1000 }).then(data => setUsers(data.items)).catch(() => {});
    setSelectedUser(null);
    setOwnerSearch('');
    setDone(false);
    setError('');
  }, [asset]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredUsers = users.filter(u => {
    if (u.id === asset?.owner_id) return false;
    const q = ownerSearch.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.employee_id.toLowerCase().includes(q);
  });

  const currentOwner = users.find(u => u.id === asset?.owner_id);

  const handleConfirm = async () => {
    if (!asset || !selectedUser) return;
    setError('');
    setSubmitting(true);
    try {
      await api.initiateTransfer(asset.id, selectedUser.id);
      setDone(true);
      onTransferInitiated();
    } catch (err: any) {
      setError(err.message || t('common.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!asset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <h2 className="text-base font-bold text-on-surface">{t('assets.transfer.title')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-surface-container-low rounded-xl p-4">
            <p className="text-xs text-on-surface-variant font-semibold mb-1">{t('assets.transfer.assetLabel')}</p>
            <p className="font-bold text-on-surface">{asset.name}</p>
            <p className="text-xs text-on-surface-variant font-mono">{asset.asset_code}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">{t('assets.transfer.currentOwner')}</label>
            <p className="text-sm text-on-surface bg-surface-container-highest rounded-lg px-3 py-2">
              {currentOwner ? `${currentOwner.name}（${currentOwner.employee_id}）` : t('assets.transfer.noOwner')}
            </p>
          </div>

          {done ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-green-600">check_circle</span>
              <div>
                <p className="font-semibold text-green-800 text-sm">{t('assets.transfer.requestSent')}</p>
                <p className="text-xs text-green-700 mt-0.5">{t('assets.transfer.emailNotification')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5" ref={ref}>
                <label className="text-xs font-semibold text-on-surface-variant">{t('assets.transfer.transferTo')}</label>
                <div className="relative">
                  <input
                    value={selectedUser ? `${selectedUser.name}（${selectedUser.employee_id}）` : ownerSearch}
                    onChange={e => { setOwnerSearch(e.target.value); setSelectedUser(null); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                    placeholder=""
                  />
                  {dropdownOpen && filteredUsers.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full bg-surface border border-outline-variant/30 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredUsers.map(u => (
                        <li
                          key={u.id}
                          className="px-3 py-2 text-sm hover:bg-surface-container cursor-pointer"
                          onMouseDown={() => { setSelectedUser(u); setOwnerSearch(''); setDropdownOpen(false); }}
                        >
                          {u.name}（{u.employee_id}）
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2">{error}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
            {done ? t('common.close') : t('common.cancel')}
          </button>
          {!done && (
            <button
              onClick={handleConfirm}
              disabled={!selectedUser || submitting}
              className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? t('assets.transfer.processing') : t('assets.transfer.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
