import React, { useState, useEffect, useCallback } from 'react';
import { api, AssetTransfer } from '../../../lib/api';
import { useAuth } from '../../auth/hooks/useAuth';

export const PendingTransfersBanner: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await api.getPendingTransfers();
      setTransfers(data);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleConfirm = async (id: number) => {
    setConfirming(id);
    try {
      await api.confirmTransfer(id);
      await fetch();
    } finally {
      setConfirming(null);
    }
  };

  const handleCancel = async (id: number) => {
    setCancelling(id);
    try {
      await api.cancelTransfer(id);
      await fetch();
    } finally {
      setCancelling(null);
    }
  };

  if (loading || transfers.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-amber-600 text-lg">swap_horiz</span>
        <p className="text-sm font-bold text-amber-800">
          待確認資產轉移（{transfers.length} 筆）
        </p>
      </div>

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
    </div>
  );
};
