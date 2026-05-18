import React from 'react';
import { useTranslation } from 'react-i18next';
import { RepairRequest } from '../../../lib/api';
import { fmtDate, fmtNumber } from '../../../lib/locale';

interface Attachment {
  id: number;
  file_url: string;
  file_name: string;
  attachable_type?: string;
  attachable_id?: number;
}

interface RepairRecord {
  id: number;
  issue_description: string;
  solution: string;
  vendor: string;
  cost: number;
  repair_date: string;
}

interface Inspection {
  id: number;
  status: boolean;
  note: string;
  checked_at?: string;
}

interface Props {
  ticket: RepairRequest | null;
  attachments?: Attachment[];
  record?: RepairRecord | null;
  inspection?: Inspection | null;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  RETURNED: 'bg-red-100 text-red-700',
  WAITING_LOANER_RETURN: 'bg-purple-100 text-purple-700',
};

export const AdminTicketDetailModal: React.FC<Props> = ({
  ticket,
  attachments = [],
  record,
  inspection,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!ticket) return null;

  const reqPhotos = attachments.filter(
    a => !a.attachable_type || a.attachable_type === 'REPAIR_REQUEST'
  );
  const processPhotos = record
    ? attachments.filter(a => a.attachable_type === 'REPAIR_RECORD' && a.attachable_id === record.id)
    : [];
  const inspectionPhotos = inspection
    ? attachments.filter(a => a.attachable_type === 'REPAIR_INSPECTION' && a.attachable_id === inspection.id)
    : [];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface z-10">
          <div>
            <span className="text-xs font-mono text-primary font-bold">
              #TKT-{String(ticket.id).padStart(4, '0')}
            </span>
            <h2 className="text-base font-bold text-on-surface mt-0.5">{t('ticketing.detail.title')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status badge */}
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[ticket.status] ?? 'bg-slate-100 text-slate-600'}`}>
            {t(`ticketing.status.${ticket.status}`, { defaultValue: ticket.status })}
          </span>

          {/* Basic info */}
          <Section title={t('ticketing.detail.basicInfo')}>
            <InfoRow label={t('ticketing.detail.requester')} value={ticket.requester_name || `${t('ticketing.user')} #${ticket.requester_id}`} />
            <InfoRow label={t('ticketing.detail.requestDate')} value={fmtDate(ticket.created_at)} />
            <InfoRow
              label={t('ticketing.detail.backupNeeded')}
              value={ticket.need_backup
                ? `${t('ticketing.detail.backupNeededYes')}${ticket.backup_spec ? `（${ticket.backup_spec}）` : ''}`
                : t('ticketing.detail.backupNeededNo')}
            />
            {ticket.loaner_asset_id && (
              <InfoRow
                label={t('ticketing.detail.backupAsset')}
                value={ticket.loaner_asset_code && ticket.loaner_asset_name
                  ? `${ticket.loaner_asset_code} — ${ticket.loaner_asset_name}`
                  : `${t('ticketing.assetLabel')} #${ticket.loaner_asset_id}`}
              />
            )}
            {ticket.pickup_location && (
              <InfoRow label={t('ticketing.detail.pickupLocation')} value={ticket.pickup_location} />
            )}
            {ticket.expected_completion_date && (
              <InfoRow
                label={t('ticketing.detail.expectedDate')}
                value={fmtDate(ticket.expected_completion_date)}
              />
            )}
          </Section>

          {/* Loaner return confirmation */}
          {ticket.status === 'WAITING_LOANER_RETURN' && (
            <Section title={t('ticketing.detail.loanerReturnTitle')} titleClass="text-purple-700">
              <div className="space-y-2">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${ticket.loaner_return_lender_confirmed ? 'bg-green-50 text-green-700' : 'bg-surface-container text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined text-sm">{ticket.loaner_return_lender_confirmed ? 'check_circle' : 'radio_button_unchecked'}</span>
                  {ticket.loaner_return_lender_confirmed ? t('ticketing.detail.lenderConfirmed') : t('ticketing.detail.lenderPending')}
                </div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${ticket.loaner_return_borrower_confirmed ? 'bg-green-50 text-green-700' : 'bg-surface-container text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined text-sm">{ticket.loaner_return_borrower_confirmed ? 'check_circle' : 'radio_button_unchecked'}</span>
                  {ticket.loaner_return_borrower_confirmed ? t('ticketing.detail.borrowerConfirmed') : t('ticketing.detail.borrowerPending')}
                </div>
              </div>
            </Section>
          )}

          {/* Fault description */}
          <Section title={t('ticketing.detail.faultDescription')}>
            <p className="text-sm text-on-surface bg-surface-container-low rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </p>
          </Section>

          {/* Reject reason */}
          {ticket.status === 'RETURNED' && ticket.reject_reason && (
            <Section title={t('ticketing.detail.rejectReason')} titleClass="text-error">
              <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2 whitespace-pre-wrap">
                {ticket.reject_reason}
              </p>
            </Section>
          )}

          {/* Request attachments */}
          {reqPhotos.length > 0 && (
            <Section title={t('ticketing.detail.attachmentPhotos')}>
              <PhotoGrid photos={reqPhotos} />
            </Section>
          )}

          {/* Closed repair record */}
          {(ticket.status === 'DONE' || ticket.status === 'WAITING_LOANER_RETURN') && record && (
            <>
              <div className="border-t border-outline-variant/20 pt-4">
                <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-3">{t('ticketing.detail.repairRecord')}</p>
                <div className="space-y-3">
                  <div className="bg-surface-container-low rounded-xl p-4 space-y-1">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.issueAnalysis')}</p>
                    <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{record.issue_description}</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-4 space-y-1">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.solutionResult')}</p>
                    <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{record.solution}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-container-low rounded-xl p-4 space-y-1">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.vendor')}</p>
                      <p className="text-sm font-semibold text-on-surface">{record.vendor || '—'}</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4 space-y-1">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.completionDate')}</p>
                      <p className="text-sm font-semibold text-on-surface">
                        {fmtDate(record.repair_date)}
                      </p>
                    </div>
                  </div>
                  <div className="bg-primary/5 rounded-xl p-4 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wide">{t('ticketing.detail.totalCost')}</p>
                    <p className="text-lg font-black text-primary">TWD ${fmtNumber(record.cost)}</p>
                  </div>
                </div>
              </div>

              {processPhotos.length > 0 && (
                <Section title={t('ticketing.detail.processPhotos')}>
                  <PhotoGrid photos={processPhotos} />
                </Section>
              )}

              {inspection && (
                <div className="border-t border-outline-variant/20 pt-4 space-y-3">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{t('ticketing.detail.inspectionResult')}</p>
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${inspection.status ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <span className="material-symbols-outlined text-lg">
                      {inspection.status ? 'check_circle' : 'cancel'}
                    </span>
                    <span className="text-sm font-bold">
                      {inspection.status ? t('ticketing.detail.inspectionPassed') : t('ticketing.detail.inspectionFailed')}
                    </span>
                  </div>
                  {inspection.note && (
                    <p className="text-sm text-on-surface-variant bg-surface-container-low rounded-lg px-3 py-2 italic leading-relaxed">
                      "{inspection.note}"
                    </p>
                  )}
                  {inspectionPhotos.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.inspectionPhotos')}</p>
                      <PhotoGrid photos={inspectionPhotos} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* In-progress repair draft */}
          {ticket.status === 'IN_PROGRESS' && record && (
            <div className="border-t border-outline-variant/20 pt-4 space-y-3">
              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">{t('ticketing.detail.inProgressRecord')}</p>
              {record.issue_description && (
                <div className="bg-surface-container-low rounded-xl p-4 space-y-1">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.issueAnalysis')}</p>
                  <p className="text-sm text-on-surface leading-relaxed">{record.issue_description}</p>
                </div>
              )}
              {record.solution && (
                <div className="bg-surface-container-low rounded-xl p-4 space-y-1">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.repairPlan')}</p>
                  <p className="text-sm text-on-surface leading-relaxed">{record.solution}</p>
                </div>
              )}
              {processPhotos.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">{t('ticketing.detail.processPhotos')}</p>
                  <PhotoGrid photos={processPhotos} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors"
          >
            {t('ticketing.detail.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; titleClass?: string; children: React.ReactNode }> = ({
  title,
  titleClass = 'text-on-surface-variant',
  children,
}) => (
  <div className="space-y-2">
    <p className={`text-xs font-semibold ${titleClass}`}>{title}</p>
    {children}
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-start gap-4">
    <span className="text-xs font-semibold text-on-surface-variant shrink-0">{label}</span>
    <span className="text-sm text-on-surface text-right">{value}</span>
  </div>
);

const PhotoGrid: React.FC<{ photos: { id: number; file_url: string; file_name: string }[] }> = ({ photos }) => (
  <div className="grid grid-cols-3 gap-2">
    {photos.map(a => (
      <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer">
        <img
          src={a.file_url}
          alt={a.file_name}
          className="w-full h-20 object-cover rounded-lg border border-outline-variant/20 hover:opacity-80 transition-opacity"
        />
      </a>
    ))}
  </div>
);
