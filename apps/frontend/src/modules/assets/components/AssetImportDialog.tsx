import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, AssetImportResponse } from '../../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const REQUIRED_COLUMNS = "asset_code,name,type,model,specification,vendor,purchase_date,purchase_price,activation_date,warranty_expiry";

export const AssetImportDialog: React.FC<Props> = ({ open, onClose, onImported }) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AssetImportResponse | null>(null);

  const handleClose = () => {
    setFile(null);
    setError('');
    setResult(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError(t('assets.import.fileRequired'));
      return;
    }
    setUploading(true);
    try {
      const data = await api.importAssetsCsv(file);
      setResult(data);
      if (data.success_count > 0) {
        onImported();
      }
    } catch (err: any) {
      setError(err.message || t('assets.import.failed'));
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
          <h2 className="text-lg font-bold text-on-surface">{t('assets.import.title')}</h2>
          <button onClick={handleClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-on-surface-variant">
              {t('assets.import.fileLabel')}
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={inputCls}
            />
            <p className="text-xs text-on-surface-variant">
              {t('assets.import.requiredColumns')}: {REQUIRED_COLUMNS}
            </p>
            <p className="text-xs text-on-surface-variant">
              {t('assets.import.optionalColumns')}: storage_location, owner_employee_id, status
            </p>
            <a
              href="/asset-import-sample.csv"
              className="text-xs font-semibold text-primary hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {t('assets.import.downloadSample')}
            </a>
          </div>

          {error && (
            <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2">{error}</p>
          )}

          {result && (
            <div className="space-y-3">
              <div className="bg-surface-container-low rounded-lg border border-outline-variant/10 px-4 py-3 text-sm">
                <span className="font-semibold text-on-surface">{t('assets.import.summary')}</span>
                <span className="ml-2 text-on-surface-variant">
                  {t('assets.import.total', { count: result.total })} ·
                  {t('assets.import.success', { count: result.success_count })} ·
                  {t('assets.import.failedCount', { count: result.failure_count })}
                </span>
              </div>
              <div className="overflow-x-auto border border-outline-variant/10 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-low text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('assets.import.table.row')}</th>
                      <th className="px-3 py-2 text-left">{t('assets.import.table.assetCode')}</th>
                      <th className="px-3 py-2 text-left">{t('assets.import.table.action')}</th>
                      <th className="px-3 py-2 text-left">{t('assets.import.table.result')}</th>
                      <th className="px-3 py-2 text-left">{t('assets.import.table.error')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r) => (
                      <tr key={`${r.row}-${r.asset_code ?? 'row'}`} className="border-t border-outline-variant/10">
                        <td className="px-3 py-2">{r.row}</td>
                        <td className="px-3 py-2">{r.asset_code ?? '-'}</td>
                        <td className="px-3 py-2">{r.action ?? '-'}</td>
                        <td className={`px-3 py-2 font-semibold ${r.success ? 'text-green-700' : 'text-error'}`}>
                          {r.success ? t('assets.import.table.success') : t('assets.import.table.failed')}
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">{r.error ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={uploading} className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
              {uploading ? t('assets.import.uploading') : t('assets.import.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const inputCls = "w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none";
