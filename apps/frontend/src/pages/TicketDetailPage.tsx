import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useTranslation } from 'react-i18next';
import { useTicketDetail } from '../modules/ticketing/hooks/useTicketDetail';

export const TicketDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { ticket, asset, record, inspection, loading, error } = useTicketDetail(id);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-100 text-blue-700';
      case 'IN_PROGRESS': return 'bg-amber-100 text-amber-700';
      case 'DONE': return 'bg-green-100 text-green-700';
      case 'CANCELLED': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getTimelineStep = (status: string) => {
    switch (status) {
      case 'OPEN': return 1;
      case 'IN_PROGRESS': return 2;
      case 'DONE': return 5; // Assuming Done includes record and inspection
      default: return 1;
    }
  };

  if (loading) {
    return (
      <DashboardLayout activeTab="tickets">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !ticket) {
    return (
      <DashboardLayout activeTab="tickets">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <span className="material-symbols-outlined text-6xl text-error/50">error</span>
          <p className="text-on-surface-variant font-medium">{error || 'Ticket not found'}</p>
          <button 
            onClick={() => navigate('/repair-history')}
            className="px-6 py-2 bg-primary text-white rounded-lg font-bold"
          >
            {t('ticketing.backToList')}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const currentStep = getTimelineStep(ticket.status);

  return (
    <DashboardLayout activeTab="tickets">
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header Section */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <button 
              onClick={() => navigate('/repair-history')}
              className="flex items-center text-primary font-semibold text-sm gap-1 hover:gap-2 transition-all mb-4 group"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              {t('ticketing.backToList')}
            </button>
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
                #TK-{ticket.id.toString().padStart(5, '0')}
              </h2>
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${getStatusColor(ticket.status)}`}>
                {t(`ticketing.status.${ticket.status}`)}
              </span>
            </div>
            <p className="text-on-surface-variant font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">calendar_today</span>
              {t('ticketing.repairDate')}：{new Date(ticket.created_at).toLocaleDateString()}
            </p>
          </div>
        </section>

        {/* Progress Timeline */}
        <section className="bg-surface-container-lowest p-8 rounded-xl border-l-4 border-primary shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
            {[
              { label: t('ticketing.timeline.step1'), icon: 'check', active: currentStep >= 1 },
              { label: t('ticketing.timeline.step2'), icon: currentStep > 2 ? 'check' : '2', active: currentStep >= 2 },
              { label: t('ticketing.timeline.step3'), icon: currentStep > 3 ? 'check' : '3', active: currentStep >= 3 || record },
              { label: t('ticketing.timeline.step4'), icon: currentStep > 4 ? 'check' : '4', active: currentStep >= 4 || inspection },
              { label: t('ticketing.timeline.step5'), icon: currentStep >= 5 ? 'check' : '5', active: currentStep >= 5 }
            ].map((step, idx) => (
              <div key={idx} className="flex flex-col items-center text-center gap-3 relative z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  step.active ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-surface-container-highest text-outline'
                }`}>
                  {step.icon === 'check' ? <span className="material-symbols-outlined">check</span> : step.icon}
                </div>
                <span className={`text-xs font-bold ${step.active ? 'text-primary' : 'text-outline'}`}>{step.label}</span>
              </div>
            ))}
            <div className="hidden md:block absolute top-5 left-[10%] right-[10%] h-[2px] bg-surface-container-highest -z-0">
              <div className="h-full bg-primary" style={{ width: `${(Math.min(currentStep, 5) - 1) * 25}%` }}></div>
            </div>
          </div>
        </section>

        {/* Grid Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/15 pb-4">
                {t('ticketing.assetDetails')}
              </h3>
              {asset && (
                <div className="flex items-start gap-6 p-4 bg-surface-container-low rounded-lg transition-all hover:shadow-md cursor-pointer">
                  <div className="w-20 h-20 bg-white rounded-lg flex items-center justify-center text-primary-container shadow-sm">
                    <span className="material-symbols-outlined text-4xl">laptop_mac</span>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-on-surface">{asset.name}</h4>
                    <p className="text-sm font-medium text-on-surface-variant">ID: {asset.asset_code}</p>
                    <div className="pt-2 flex gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-surface-variant rounded uppercase">{asset.type}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-surface-variant rounded uppercase">{asset.vendor}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-outline uppercase tracking-wider">{t('ticketing.faultDescription')}</label>
                  <div className="p-4 bg-surface-container-low rounded-lg text-sm text-on-surface leading-relaxed border-l-4 border-error/30">
                    "{ticket.description}"
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-outline uppercase tracking-wider">{t('ticketing.spareMachine')}</label>
                    <p className="text-sm font-medium text-on-surface">{ticket.backup_spec || t('ticketing.noNeed')}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-outline uppercase tracking-wider">{t('ticketing.pickupLocation')}</label>
                    <p className="text-sm font-medium text-on-surface">{ticket.pickup_location || t('ticketing.notSpecified')}</p>
                  </div>
                </div>
              </div>
            </div>

            {record && (
              <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm border-l-4 border-tertiary animate-in slide-in-from-left duration-500">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">{t('ticketing.repairRecord')}</h3>
                  <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed px-2 py-1 rounded">
                    {record.vendor}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  <div className="space-y-1">
                    <p className="text-xs text-outline font-bold uppercase">{t('ticketing.repairDate')}</p>
                    <p className="text-sm font-semibold">{new Date(record.repair_date).toLocaleDateString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-outline font-bold uppercase">{t('ticketing.faultReason')}</p>
                    <p className="text-sm font-semibold">{record.issue_description}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-outline font-bold uppercase">{t('ticketing.solution')}</p>
                    <p className="text-sm font-semibold">{record.solution}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-outline font-bold uppercase">{t('ticketing.cost')}</p>
                    <p className="text-sm font-bold text-error">${record.cost.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-8">
            {!inspection ? (
              <div className="p-8 rounded-xl border border-dashed border-outline-variant/30 py-12 bg-surface-container flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-outline mb-4">
                  <span className="material-symbols-outlined text-3xl">fact_check</span>
                </div>
                <h3 className="text-base font-bold text-on-surface-variant">{t('ticketing.waitingInspection')}</h3>
                <p className="text-xs text-outline mt-2 max-w-[200px]">{t('ticketing.inspectionDesc')}</p>
              </div>
            ) : (
              <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm border-l-4 border-green-500 animate-in slide-in-from-right duration-500">
                <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant mb-4">{t('ticketing.inspectionResult')}</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`material-symbols-outlined ${inspection.status ? 'text-green-500' : 'text-error'}`}>
                      {inspection.status ? 'check_circle' : 'cancel'}
                    </span>
                    <span className="text-sm font-bold">{inspection.status ? t('ticketing.passed') : t('ticketing.failed')}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant bg-surface-container p-4 rounded-lg italic">
                    "{inspection.note}"
                  </p>
                  <p className="text-[10px] text-outline">
                    {t('ticketing.inspectedAt')}: {new Date(inspection.checked_at).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};
