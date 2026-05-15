import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, AssetTransfer } from '../../../lib/api';
import { useAuth } from '../../auth/hooks/useAuth';

interface Props {
  onConfirmed?: () => void;
}

interface BannerMsg {
  type: 'error' | 'info';
  text: string;
}

export const PendingTransfersBanner: React.FC<Props> = ({ onConfirmed }) => {
  const { user } = useAuth();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [loading, setLoading] = useState(true);
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
        ? '此轉移已被撤銷或已完成，無法確認，清單已自動更新。'
        : '操作失敗，請稍後再試。';
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
      if (msg.includes('已結束') || msg.includes('400')) {
        // 先顯示 dialog，刷新延後到使用者關閉 dialog 時才執行
        setCancelErrorDialog(true);
      } else {
        showMsg({ type: 'error', text: '操作失敗，請稍後再試。' });
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
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-600 text-lg">swap_horiz</span>
          <p className="text-sm font-bold text-amber-800">
            待確認資產轉移（{transfers.length} 筆）
          </p>
        </div>

        {bannerMsg && (
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

        {transfers.length > 0 && (
          <div className="space-y-2">
            {transfers.map(t => {
              const myId = user?.id;
              const iAmFrom = myId === t.from_owner_id;
              const iAmTo = myId === t.to_owner_id;
              const iHaveConfirmed = (iAmFrom && t.from_confirmed) || (iAmTo && t.to_confirmed);
              const otherName = iAmFrom ? t.to_owner_name : t.from_owner_name;

              return (
                <div key={t.id} className="bg-white rounded-lg px-4 py-3 flex items-center justify-between gap-4 border border-amber-100 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {t.asset_name ?? `資產 #${t.asset_id}`}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      <span className="font-medium">{t.from_owner_name ?? '—'}</span>
                      <span className="mx-1.5">→</span>
                      <span className="font-medium">{t.to_owner_name ?? '—'}</span>
                      <span className="mx-1.5 text-on-surface-variant/40">·</span>
                      {new Date(t.created_at).toLocaleDateString('zh-TW')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {iHaveConfirmed ? (
                      <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        已確認，等待{otherName ?? '對方'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConfirm(t.id)}
                        disabled={confirming === t.id}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {confirming === t.id ? '確認中...' : '確認轉移'}
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => handleCancel(t.id)}
                        disabled={cancelling === t.id}
                        className="px-3 py-1.5 text-xs font-medium text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {cancelling === t.id ? '撤銷中...' : '撤銷'}
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
                  <p className="font-bold text-on-surface">無法撤銷此資產轉移</p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    雙方皆已確認，此筆資產轉移已完成，無法再撤銷。
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleDismissCancelError}
                  className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
