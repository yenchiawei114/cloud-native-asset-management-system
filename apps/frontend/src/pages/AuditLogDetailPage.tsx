import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAuditDetail } from '../modules/audit/hooks/useAuditDetail';

export const AuditLogDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { log, loading, error } = useAuditDetail(Number(id));

  if (loading) {
    return (
      <DashboardLayout activeTab="audit">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !log) {
    return (
      <DashboardLayout activeTab="audit">
        <div className="p-8 text-center text-error">
          <p>{t('audit.errors.loading')}: {error || t('audit.errors.notFound')}</p>
          <button onClick={() => navigate('/audit-logs')} className="mt-4 text-primary font-bold hover:underline">{t('audit.backToList')}</button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="audit">
      <main className="max-w-6xl mx-auto px-8 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex items-center gap-6 mb-10">
          <button 
            onClick={() => navigate('/audit-logs')}
            className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-high rounded-full transition-all text-on-surface bg-surface-container-low"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <nav className="flex text-[10px] font-bold text-outline uppercase tracking-widest mb-1 gap-2">
              <span>{t('auth.nav.auditLogs')}</span>
              <span className="opacity-30">/</span>
              <span className="text-primary">{t('audit.detailTitle')}</span>
            </nav>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{t('audit.detailTitle')}</h1>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Info */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-outline mb-8">{t('audit.summary.title')}</h2>
              <div className="space-y-6">
                <InfoRow label={t('audit.summary.logId')} value={`LOG-${log.id.toString().padStart(6, '0')}`} isMono />
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium text-on-surface-variant">{t('audit.operator')}</span>
                  <div className="flex items-center gap-2 text-right">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary uppercase">
                      {log.actor_name?.charAt(0) || 'S'}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-on-surface">{log.actor_name || 'System'}</div>
                      <div className="text-[10px] text-outline font-bold uppercase">ID: {log.user_id}</div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-on-surface-variant">{t('audit.action')}</span>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${log.action === 'CREATE' ? 'bg-green-100 text-green-700' : log.action === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {t(`audit.actionType.${log.action}`)}
                  </span>
                </div>
                <InfoRow label={t('audit.timestamp')} value={new Date(log.timestamp).toLocaleString()} />
                <InfoRow label={t('audit.summary.ip')} value="127.0.0.1" isMono />
              </div>
            </section>

            <section className="bg-surface-container-low/40 p-8 rounded-2xl border border-outline-variant/10">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-outline mb-6">{t('audit.summary.affectedEntity')}</h2>
              <div className="flex flex-col gap-5">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-4xl">
                    {log.target_type === 'ASSET' ? 'inventory_2' : log.target_type === 'USER' ? 'person' : 'description'}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] text-outline font-bold uppercase mb-1">{t('audit.targetType')}</div>
                  <div className="text-lg font-black text-on-surface">{t(`audit.type.${log.target_type}`)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-outline font-bold uppercase mb-1">{t('audit.targetName')}</div>
                  <div className="text-sm font-bold text-primary">{log.target_name || 'N/A'}</div>
                </div>
                <button 
                  onClick={() => navigate(`/${log.target_type.toLowerCase()}s/${log.target_id}`)}
                  className="mt-2 flex items-center justify-center gap-2 py-3 bg-white text-primary text-xs font-bold rounded-xl border border-primary/10 hover:shadow-md transition-all active:scale-95"
                >
                  {t('audit.viewFullHistory')} <span className="material-symbols-outlined text-sm">open_in_new</span>
                </button>
              </div>
            </section>
          </div>

          {/* Right Column: Diff */}
          <div className="lg:col-span-8">
            <section className="bg-surface-container-lowest p-10 rounded-2xl shadow-sm border border-outline-variant/10 min-h-[600px]">
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-2xl font-black tracking-tighter flex items-center gap-3 text-on-surface font-headline">
                  <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>difference</span>
                  {t('audit.diff.title')}
                </h2>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-100 border border-red-200"></div>
                    <span className="text-[10px] font-bold text-outline uppercase">{t('audit.diff.oldValue')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200"></div>
                    <span className="text-[10px] font-bold text-outline uppercase">{t('audit.diff.newValue')}</span>
                  </div>
                </div>
              </div>

              {log.detail ? (
                <div className="space-y-8">
                  {log.action === 'UPDATE' && log.detail.before && log.detail.after ? (
                    (() => {
                      const before = log.detail.before;
                      const after = log.detail.after;

                      // Check if it's a direct value comparison (string/number) or an object comparison
                      const isObject = typeof after === 'object' && after !== null && !Array.isArray(after);
                      
                      if (!isObject) {
                        return (
                          <DiffRow 
                            label="value"
                            oldValue={before}
                            newValue={after}
                          />
                        );
                      }

                      const changedFields = Object.keys(after).filter(key => 
                        JSON.stringify(before[key]) !== JSON.stringify(after[key])
                      );
                      
                      if (changedFields.length === 0) {
                        return (
                          <div className="bg-surface-container-low/30 rounded-2xl p-8 text-center text-outline">
                            <p className="text-sm font-medium">沒有檢測到明顯的資料變動</p>
                          </div>
                        );
                      }

                      return changedFields.map(key => (
                        <DiffRow 
                          key={key}
                          label={key}
                          oldValue={before?.[key]}
                          newValue={after?.[key]}
                        />
                      ));
                    })()
                  ) : (
                    <div className="space-y-4">
                      <div className="text-xs font-bold text-outline uppercase tracking-widest mb-4">
                        {log.action === 'CREATE' ? t('audit.diff.after') : t('audit.diff.before')}
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {(() => {
                          const data = log.action === 'CREATE' ? log.detail.after : (log.detail.before || log.detail);
                          if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                            return <SingleValueRow label="value" value={data} type={log.action === 'CREATE' ? 'add' : 'remove'} />;
                          }
                          return Object.entries(data).map(([key, value]) => (
                            <SingleValueRow key={key} label={key} value={value} type={log.action === 'CREATE' ? 'add' : 'remove'} />
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                  <span className="material-symbols-outlined text-6xl mb-4">data_info_alert</span>
                  <p className="font-bold">{t('audit.errors.noDetail')}</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
};

const InfoRow: React.FC<{ label: string, value: string, isMono?: boolean }> = ({ label, value, isMono }) => (
  <div className="flex justify-between items-center">
    <span className="text-sm font-medium text-on-surface-variant">{label}</span>
    <span className={`text-sm font-bold text-on-surface ${isMono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);

const formatDiffValue = (val: any, fieldKey: string, t: any) => {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'boolean') return val ? t('ticketing.passed') : t('ticketing.failed');
  
  if (fieldKey === 'status') {
    const assetStatus = t(`assets.status.${val}`, { defaultValue: '' });
    const ticketStatus = t(`ticketing.status.${val}`, { defaultValue: '' });
    return assetStatus || ticketStatus || val.toString();
  }
  if (fieldKey === 'type') {
    return t(`assets.type.${val}`, { defaultValue: val.toString() });
  }
  
  return val.toString();
};

const SingleValueRow: React.FC<{ label: string, value: any, type: 'add' | 'remove' }> = ({ label, value, type }) => {
  const { t } = useTranslation();
  const isAdd = type === 'add';
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center py-3 px-4 rounded-xl border border-outline-variant/10 bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="md:col-span-4">
        <div className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
          {t(`audit.fields.${label}`, { defaultValue: label })}
        </div>
      </div>
      <div className="md:col-span-8">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${isAdd ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          <span className="material-symbols-outlined text-xs">
            {isAdd ? 'add_circle' : 'remove_circle'}
          </span>
          {formatDiffValue(value, label, t)}
        </div>
      </div>
    </div>
  );
};

const DiffRow: React.FC<{ label: string, oldValue: any, newValue: any }> = ({ label, oldValue, newValue }) => {
  const { t } = useTranslation();
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start py-2 border-b border-outline-variant/5 last:border-0">
      <div className="md:col-span-3">
        <div className="text-[11px] font-black uppercase tracking-widest text-primary/70 mb-1">
          {t(`audit.fields.${label}`, { defaultValue: label })}
        </div>
        <div className="text-[9px] font-mono text-outline opacity-50">{label}</div>
      </div>
      <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative group">
          <div className="flex items-center gap-3 p-4 bg-red-50/30 border border-red-100 rounded-xl transition-all">
            <span className="material-symbols-outlined text-red-300 text-sm">remove_circle</span>
            <span className="text-sm font-medium text-red-900/70 break-all line-through decoration-red-200 decoration-2">
              {formatDiffValue(oldValue, label, t)}
            </span>
          </div>
        </div>
        <div className="relative group">
          <div className="flex items-center gap-3 p-4 bg-green-50/50 border border-green-200 rounded-xl transition-all shadow-sm">
            <span className="material-symbols-outlined text-green-500 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            <span className="text-sm font-bold text-green-900 break-all">
              {formatDiffValue(newValue, label, t)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
