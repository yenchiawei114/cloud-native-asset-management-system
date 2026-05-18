import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, AssetTransfer } from '../../../lib/api';
import { useAuth } from '../../auth/hooks/useAuth';
import { fmtDate } from '../../../lib/locale';

interface Props {
  onConfirmed?: () => void;
}

interface BannerMsg {
  type: 'error' | 'info';
  text: string;
}

export const PendingTransfersBanner: React.FC<Props> = ({ onConfirmed }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [bannerMsg, setBannerMsg] = useState<BannerMsg | null>(null);
  const [cancelErrorDialog, setCancelErrorDialog] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMsg = useCallback((msg: BannerMsg) => {
    setBannerMsg(msg);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setBannerMsg(null), 5000);
  }, []);

  const fetchTransfers = useCallback(async () => {
    try {
      const data = await api.getPendingTransfers();
      setTransfers(data);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);
  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const handleConfirm = async (id: number) => {
    setConfirming(id);
    try {
      await api.confirmTransfer(id);
      await fetchTransfers();
      onConfirmed?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const text = msg.includes('已結束') || msg.includes('400')
        ? t('assets.transfer.cancelledError')
        : t('assets.transfer.operationFailed');
      showMsg({ type: 'error', text });
      await fetchTransfers();
      onConfirmed?.();
    } finally {
      setConfirming(null);
    }
  };

  const handleCancel = async (id: number) => {
    setCancelling(id);
    try {
      await api.cancelTransfer(id);
      await fetchTransfers();
      onConfirmed?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('已結束') || msg.includes('400') || msg.includes('403') || msg.includes('只有發起者')) {
        setCancelErrorDialog(true);
      } else {
        showMsg({ type: 'error', text: t('assets.transfer.operationFailed') });
        await fetchTransfers();
        onConfirmed?.();
      }
    } finally {
      setCancelling(null);
    }
  };

  const handleDismissCancelError = async () => {
    setCancelErrorDialog(false);
    await fetchTransfers();
    onConfirmed?.();
  };

  if (loading || (transfers.length === 0 && !bannerMsg)) return null;

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600 text-lg">swap_horiz</span>
            <p className="text-sm font-bold text-amber-800">
              {t('assets.transfer.bannerTitle', { count: transfers.length })}
            </p>
          </div>
          <span className={`material-symbols-outlined text-amber-600 text-lg transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>
            expand_more
          </span>
        </button>

        {!collapsed && bannerMsg && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
            bannerMsg.type === 'error'
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            <span className="material-symbols-outlined text-sm shrink-0">
              {bannerMsg.type === 'error' ? 'error' : 'info'}
            </span>
            {bannerMsg.text}
          </div>
        )}

        {!collapsed && transfers.length > 0 && (
          <div className="space-y-2">
            {transfers.map(transfer => {
              const myId = user?.id;
              const iAmFrom = myId === transfer.from_owner_id;
              const iAmTo = myId === transfer.to_owner_id;
              const iHaveConfirmed = (iAmFrom && transfer.from_confirmed) || (iAmTo && transfer.to_confirmed);
              const otherName = iAmFrom ? transfer.to_owner_name : transfer.from_owner_name;

              return (
                <div key={transfer.id} className="bg-white rounded-lg px-4 py-3 flex items-center justify-between gap-4 border border-amber-100 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {transfer.asset_name ?? t('assets.transfer.assetFallback', { id: transfer.asset_id })}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      <span className="font-medium">{transfer.from_owner_name ?? '—'}</span>
                      <span className="mx-1.5">→</span>
                      <span className="font-medium">{transfer.to_owner_name ?? '—'}</span>
                      <span className="mx-1.5 text-on-surface-variant/40">·</span>
                      {fmtDate(transfer.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {iHaveConfirmed ? (
                      <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        {t('assets.transfer.confirmedWaiting', { name: otherName ?? t('assets.transfer.otherParty') })}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConfirm(transfer.id)}
                        disabled={confirming === transfer.id}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {confirming === transfer.id ? t('assets.transfer.confirming') : t('assets.transfer.confirm')}
                      </button>
                    )}

                    {isAdmin && user?.id === transfer.initiator_id && (
                      <button
                        onClick={() => handleCancel(transfer.id)}
                        disabled={cancelling === transfer.id}
                        className="px-3 py-1.5 text-xs font-medium text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {cancelling === transfer.id ? t('assets.transfer.cancelling') : t('assets.transfer.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cancelErrorDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-error text-2xl shrink-0 mt-0.5">cancel</span>
                <div>
                  <p className="font-bold text-on-surface">{t('assets.transfer.cannotCancelTitle')}</p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {t('assets.transfer.completedCantCancel')}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleDismissCancelError}
                  className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
                >
                  {t('common.understood')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
