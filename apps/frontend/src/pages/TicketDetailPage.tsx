import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useTranslation } from 'react-i18next';
import { useTicketDetail } from '../modules/ticketing/hooks/useTicketDetail';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { api } from '../lib/api';
import { ticketService } from '../modules/ticketing/services/ticketService';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';

const EMPLOYEE_STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export const TicketDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { ticket, asset, record, inspection, attachments, loading, error, refresh } = useTicketDetail(id);
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  const [recordForm, setRecordForm] = useState({
    fault_reason: '',
    solution: '',
    completion_date: '',
    vendor: '',
    cost: 0
  });

  const [inspectionForm, setInspectionForm] = useState({
    status: true,
    note: ''
  });

  const [selectedRecordFiles, setSelectedRecordFiles] = useState<File[]>([]);
  const [selectedInspectionFiles, setSelectedInspectionFiles] = useState<File[]>([]);
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const backPath = isAdmin ? '/ticket-review' : '/repair-history';

  const handleApprove = async () => {
    if (!ticket) return;
    setIsSubmitting(true);
    try {
      await api.approveTicket(ticket.id, 'IN_PROGRESS');
      await refresh();
    } catch (err: any) {
      showFeedback({ title: '操作失敗', message: err.message, type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!ticket || !rejectReason) return;
    setIsSubmitting(true);
    try {
      await api.rejectTicket(ticket.id, rejectReason);
      setShowRejectModal(false);
      await refresh();
    } catch (err: any) {
      showFeedback({ title: '操作失敗', message: err.message, type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!ticket) return;
    setIsSubmitting(true);
    try {
      await api.createTicketRecord(ticket.id, {
        repair_date: recordForm.completion_date || new Date().toISOString().split('T')[0],
        issue_description: recordForm.fault_reason,
        solution: recordForm.solution,
        cost: recordForm.cost,
        vendor: recordForm.vendor
      });
      showFeedback({ title: '儲存成功', message: '進度已儲存', type: 'success', onConfirm: closeFeedback });
      await refresh();
    } catch (err: any) {
      showFeedback({ title: '操作失敗', message: err.message, type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRecord = async () => {
    if (!ticket) return;
    setIsSubmitting(true);
    try {
      const payload = {
        repair_date: recordForm.completion_date || new Date().toISOString().split('T')[0],
        issue_description: recordForm.fault_reason,
        solution: recordForm.solution,
        cost: recordForm.cost,
        vendor: recordForm.vendor
      };

      let activeRecordId: number;
      if (record && isEditingRecord) {
        const result: any = await api.updateTicketRecord(ticket.id, payload);
        activeRecordId = result.id;
      } else {
        const result: any = await api.createTicketRecord(ticket.id, payload);
        activeRecordId = result.id;
      }
      
      // 上傳緩衝的維修照片
      if (selectedRecordFiles.length > 0) {
        for (const file of selectedRecordFiles) {
          await ticketService.uploadAttachment(activeRecordId, file, 'REPAIR_RECORD');
        }
      }

      await refresh();
      setSelectedRecordFiles([]);
      showFeedback({ 
        title: '提交成功', 
        message: isEditingRecord ? "維修紀錄已更新" : "維修紀錄已提交", 
        type: 'success', 
        onConfirm: closeFeedback 
      });
    } catch (err: any) {
      showFeedback({ 
        title: '提交失敗', 
        message: err.message || "提交失敗，請稍後再試", 
        type: 'error', 
        onConfirm: closeFeedback 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitInspection = async () => {
    if (!ticket || !user) return;
    setIsSubmitting(true);
    try {
      // 1. Create inspection
      const inspectionResult: any = await api.createTicketInspection(ticket.id, {
        status: inspectionForm.status,
        note: inspectionForm.note,
        checked_by: user!.id
      });

      // 2. Upload buffered files if any
      if (selectedInspectionFiles.length > 0) {
        for (const file of selectedInspectionFiles) {
          await ticketService.uploadAttachment(inspectionResult.id, file, 'REPAIR_INSPECTION');
        }
      }

      // 3. 如果驗收通過，則自動結案 (DONE)
      if (inspectionForm.status) {
        await api.approveTicket(ticket.id, 'DONE');
      }

      await refresh();
      setSelectedInspectionFiles([]);
      if (inspectionForm.status) {
        showFeedback({ 
          title: '驗收通過', 
          message: "驗收通過，工單已正式結案。", 
          type: 'success', 
          onConfirm: closeFeedback 
        });
      } else {
        showFeedback({ 
          title: '驗收不通過', 
          message: "驗收不通過，請聯繫維修廠商進行後續處理。", 
          type: 'info', 
          onConfirm: closeFeedback 
        });
      }
    } catch (err: any) {
      showFeedback({ title: '操作失敗', message: err.message, type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string, id: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('attachable_type', type);
    formData.append('attachable_id', id.toString());

    setIsSubmitting(true);
    try {
      await api.uploadAttachment(formData);
      await refresh();
    } catch (err: any) {
      showFeedback({ title: '操作失敗', message: err.message, type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
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
            onClick={() => navigate(backPath)}
            className="px-6 py-2 bg-primary text-white rounded-lg font-bold"
          >
            {t('ticketing.backToList')}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  /* ── Employee simplified view ── */
  if (!isAdmin) {
    const requestAttachments = attachments.filter(a => a.attachable_type === 'REPAIR_REQUEST');
    return (
      <DashboardLayout activeTab="assets">
        <div className="max-w-2xl mx-auto space-y-5 pb-12 animate-in fade-in duration-300">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center text-primary font-semibold text-sm gap-1 hover:gap-1.5 transition-all group"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            返回
          </button>

          {/* Ticket header */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">維修工單</p>
                <h2 className="text-2xl font-black font-headline text-on-surface">
                  #TK-{ticket.id.toString().padStart(5, '0')}
                </h2>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${EMPLOYEE_STATUS_BADGE[ticket.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {t(`ticketing.status.${ticket.status}`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 pt-3 border-t border-slate-100">
              <InfoItem label="申請人" value={ticket.requester_name ?? '—'} />
              <InfoItem label="申請日期" value={new Date(ticket.created_at).toLocaleDateString()} />
              <InfoItem label="資產" value={asset ? `${asset.name}（${asset.asset_code}）` : '—'} />
            </div>
          </div>

          {/* Fault description */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-slate-100 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">故障描述</p>
            <p className="text-sm text-on-surface leading-relaxed">{ticket.description}</p>
          </div>

          {/* Backup need */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-slate-100 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">備用機需求</p>
            {ticket.need_backup ? (
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  需要備用機
                </span>
                {ticket.backup_spec && (
                  <p className="text-sm text-on-surface-variant">{ticket.backup_spec}</p>
                )}
              </div>
            ) : (
              <span className="text-sm text-on-surface-variant">不需要備用機</span>
            )}
          </div>

          {/* Attachments with lightbox */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-slate-100 space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">附件照片</p>
            {requestAttachments.length === 0 ? (
              <p className="text-sm text-on-surface-variant">無附件</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {requestAttachments.map(file => (
                  <button
                    key={file.id}
                    onClick={() => setLightboxUrl(file.file_url)}
                    className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 hover:scale-105 transition-all shadow-sm"
                  >
                    <img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lightbox */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <img
              src={lightboxUrl}
              alt="attachment"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              className="absolute top-5 right-5 text-white/80 hover:text-white transition-colors"
              onClick={() => setLightboxUrl(null)}
            >
              <span className="material-symbols-outlined text-3xl">close</span>
            </button>
          </div>
        )}
      </DashboardLayout>
    );
  }

  /* ── Admin full view ── */
  return (
    <DashboardLayout activeTab="tickets">
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        {/* Top Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <button
              onClick={() => navigate(backPath)}
              className="flex items-center text-primary font-semibold text-sm gap-1 hover:gap-2 transition-all mb-4 group"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              {t('ticketing.backToList')}
            </button>
            <h2 className="text-xl font-bold font-headline tracking-tight text-primary">{t('ticketing.repairRequestDetail')}</h2>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Ticket Header Hero */}
            <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm space-y-4 relative overflow-hidden">
              <div className="flex justify-between items-start relative z-10">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-primary uppercase tracking-widest">維修工單編號</span>
                  <h3 className="text-3xl font-black font-headline text-on-surface">#TK-{ticket.id.toString().padStart(5, '0')}</h3>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${
                    ticket.status === 'DONE' ? 'bg-green-100 text-green-700' :
                    ticket.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' :
                    ticket.status === 'CANCELLED' ? 'bg-error-container text-on-error-container' :
                    'bg-secondary-container text-on-secondary-container'
                  }`}>
                    {t(`ticketing.status.${ticket.status}`)}
                  </span>
                  <span className="text-[10px] font-bold text-outline">版本: v{ticket.version}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-12 gap-y-6 pt-4 border-t border-outline-variant/15 relative z-10">
                <div>
                  <span className="block text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mb-1">申請人</span>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {ticket.requester_name?.charAt(0) || 'U'}
                    </div>
                    <span className="font-semibold text-on-surface">{ticket.requester_name || '使用者'}</span>
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mb-1">申請日期</span>
                  <span className="font-semibold text-on-surface">{new Date(ticket.created_at).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mb-1">預計完工</span>
                  <span className="font-semibold text-on-surface">
                    {ticket.expected_completion_date ? new Date(ticket.expected_completion_date).toLocaleDateString() : '未設定'}
                  </span>
                </div>
              </div>
              <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
            </div>

            {/* Ticket Details Bento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface-container-low p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined">laptop_mac</span>
                  <h4 className="font-bold text-sm">設備與故障資訊</h4>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-white/50 rounded-lg">
                    <span className="text-[10px] font-bold text-outline uppercase">設備名稱</span>
                    <p className="font-bold text-sm">{asset?.name || 'Loading...'}</p>
                  </div>
                  <div className="p-3 bg-error/5 rounded-lg border border-error/5">
                    <span className="text-[10px] font-bold text-error uppercase">故障描述</span>
                    <p className="font-medium text-sm text-on-surface mt-1">{ticket.description}</p>
                  </div>
                  
                  {/* Attachments Section */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-outline uppercase">附件照片</span>
                    <div className="flex flex-wrap gap-3">
                      {attachments.map((file) => (
                        <div 
                          key={file.id} 
                          className="group relative w-16 h-16 rounded-lg overflow-hidden border border-outline/10 shadow-sm hover:shadow-md transition-all cursor-pointer"
                          onClick={() => window.open(file.file_url, '_blank')}
                        >
                          <img 
                            src={file.file_url} 
                            alt={file.file_name} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-sm">visibility</span>
                          </div>
                        </div>
                      ))}
                      
                      {/* Upload Button */}
                      <div className="w-16 h-16 rounded-lg bg-surface-container-highest flex items-center justify-center text-outline group relative cursor-pointer overflow-hidden border border-dashed border-outline/30 hover:border-primary/50 transition-colors">
                        <input 
                          type="file" 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                          onChange={(e) => handleFileUpload(e, 'REPAIR_REQUEST', ticket.id)}
                        />
                        <span className="material-symbols-outlined group-hover:scale-110 transition-transform">add_a_photo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined">swap_horiz</span>
                  <h4 className="font-bold text-sm">備機與收件需求</h4>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-white rounded-xl shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-on-surface-variant">備機需求</span>
                      {ticket.need_backup && (
                        <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded-full uppercase font-black">Urgent</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-primary">{ticket.backup_spec || '不需備機'}</p>
                  </div>
                  <div className="p-4 bg-white/50 rounded-xl">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">收件地點</span>
                    <p className="text-sm font-semibold text-on-surface mt-1">
                      <span className="material-symbols-outlined text-xs align-middle mr-1">location_on</span>
                      {ticket.pickup_location || '現場維修'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Maintenance Record Section */}
            {(isAdmin || record) && (
              <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm space-y-6 ring-1 ring-primary/5">
                <div className="flex items-center justify-between border-b border-outline-variant/15 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">history_edu</span>
                    <h4 className="text-lg font-bold text-on-surface">維修紀錄 (Maintenance Record)</h4>
                  </div>
                  <div className="flex items-center gap-4">
                    {isAdmin && record && ticket.status === 'IN_PROGRESS' && !isEditingRecord && (
                      <button 
                        onClick={() => {
                          setRecordForm({
                            fault_reason: record.issue_description,
                            solution: record.solution,
                            completion_date: record.repair_date,
                            vendor: record.vendor,
                            cost: record.cost
                          });
                          setIsEditingRecord(true);
                        }}
                        className="text-xs font-bold text-secondary hover:bg-secondary/5 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        修改紀錄
                      </button>
                    )}
                    {isAdmin && ticket.status === 'IN_PROGRESS' && (
                      <button 
                        onClick={handleSaveDraft}
                        className="text-xs font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">save</span>
                        暫存進度
                      </button>
                    )}
                  </div>
                </div>
                
                {record && !isEditingRecord ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="p-4 bg-surface-container-low rounded-xl">
                        <span className="text-[10px] font-bold text-outline uppercase block mb-1">故障原因判斷</span>
                        <p className="text-sm font-semibold">{record.issue_description}</p>
                      </div>
                      <div className="p-4 bg-surface-container-low rounded-xl">
                        <span className="text-[10px] font-bold text-outline uppercase block mb-1">維修方案與結果</span>
                        <p className="text-sm font-semibold">{record.solution}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between p-4 bg-surface-container-low rounded-xl">
                        <div>
                          <span className="text-[10px] font-bold text-outline uppercase block mb-1">承辦廠商</span>
                          <p className="text-sm font-semibold">{record.vendor}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-outline uppercase block mb-1">完工日期</span>
                          <p className="text-sm font-semibold">{new Date(record.repair_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
                        <span className="text-[10px] font-bold text-primary uppercase block mb-1">維修總費用</span>
                        <p className="text-2xl font-black text-primary">TWD ${record.cost.toLocaleString()}</p>
                      </div>
                    </div>
                    {/* Record Attachments */}
                    <div className="md:col-span-2 space-y-4 pt-4 border-t border-outline-variant/10">
                      <span className="text-[10px] font-bold text-outline uppercase block mb-1">維修過程照片</span>
                      <div className="flex flex-wrap gap-2">
                        {attachments.filter(a => a.attachable_type === 'REPAIR_RECORD').map((file) => (
                          <div key={file.id} className="w-12 h-12 rounded-lg overflow-hidden border border-outline/10 cursor-pointer" onClick={() => window.open(file.file_url, '_blank')}>
                            <img src={file.file_url} className="w-full h-full object-cover" />
                          </div>
                        ))}
                        <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-outline group relative cursor-pointer border border-dashed border-outline/30 hover:border-primary/50 transition-colors">
                          <input 
                            type="file" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                            onChange={(e) => handleFileUpload(e, 'REPAIR_RECORD', record.id)} 
                          />
                          <span className="material-symbols-outlined text-sm group-hover:scale-110 transition-transform">add_a_photo</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : isAdmin && ticket.status === 'IN_PROGRESS' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
                          故障原因 <span className="text-error">*</span>
                        </label>
                        <textarea 
                          className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 text-sm transition-all min-h-[100px]"
                          placeholder="請詳細描述檢測後的故障原因..."
                          value={recordForm.fault_reason}
                          onChange={(e) => setRecordForm({...recordForm, fault_reason: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
                          維修方案 <span className="text-error">*</span>
                        </label>
                        <textarea 
                          className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 text-sm transition-all min-h-[100px]"
                          placeholder="例如：更換主機板、重貼散熱膏..."
                          value={recordForm.solution}
                          onChange={(e) => setRecordForm({...recordForm, solution: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant">預計/實際完工日</label>
                        <input 
                          className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 text-sm transition-all"
                          type="date"
                          value={recordForm.completion_date}
                          onChange={(e) => setRecordForm({...recordForm, completion_date: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant">承修廠商/人員</label>
                        <input 
                          className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 text-sm transition-all"
                          placeholder="例如：華碩原廠維修中心"
                          value={recordForm.vendor}
                          onChange={(e) => setRecordForm({...recordForm, vendor: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-on-surface-variant">維修費用 (TWD)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-3 text-sm font-bold text-primary">$</span>
                          <input 
                            className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg p-3 pl-7 text-lg font-black text-primary transition-all"
                            type="number"
                            value={recordForm.cost || ''}
                            onChange={(e) => setRecordForm({...recordForm, cost: e.target.value === '' ? 0 : parseInt(e.target.value)})}
                          />
                        </div>
                      </div>
                      {/* Buffered Image Upload for Record */}
                      <div className="space-y-2 mt-4 pt-4 border-t border-outline-variant/10">
                        <label className="text-[10px] font-bold text-outline uppercase block">上傳維修過程照片 (建議)</label>
                        <div className="flex flex-wrap gap-2">
                          {selectedRecordFiles.map((file, idx) => (
                            <div key={idx} className="w-12 h-12 rounded-lg bg-slate-100 border relative group overflow-hidden">
                              <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                              <button 
                                onClick={() => setSelectedRecordFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </div>
                          ))}
                          <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center text-outline group relative cursor-pointer border border-dashed border-outline/30 hover:border-primary/50 transition-colors">
                            <input 
                              type="file" 
                              multiple
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                              onChange={(e) => {
                                if (e.target.files) {
                                  setSelectedRecordFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                }
                              }} 
                            />
                            <span className="material-symbols-outlined text-sm">add_a_photo</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4">
                        <button 
                          onClick={handleSubmitRecord}
                          disabled={isSubmitting || !recordForm.fault_reason || !recordForm.solution}
                          className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined">how_to_reg</span>
                          {isEditingRecord ? '儲存修改' : '提交維修紀錄'}
                        </button>
                        {isEditingRecord && (
                          <button 
                            onClick={() => setIsEditingRecord(false)}
                            className="w-full mt-2 py-2 text-outline font-bold text-xs hover:text-on-surface transition-colors"
                          >
                            取消修改
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-dashed border-outline/20">
                    <span className="material-symbols-outlined text-4xl text-outline/30 mb-2">pending_actions</span>
                    <p className="text-sm text-on-surface-variant italic">工單正在處理中，尚未產生正式維修紀錄。</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Action Sidebar */}
          <div className="space-y-6">
            {/* Admin Approval Actions */}
            {isAdmin && ticket.status === 'OPEN' && (
              <div className="bg-surface-container-high p-6 rounded-3xl space-y-4 shadow-xl shadow-primary/5 border border-primary/10 animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  <h4 className="text-xs font-black text-on-surface uppercase tracking-widest">待辦審核</h4>
                </div>
                <button 
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:translate-y-0 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  核准申請
                </button>
                <button 
                  onClick={() => setShowRejectModal(true)}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-white text-error font-bold rounded-2xl border border-error/20 hover:bg-error/5 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">cancel</span>
                  拒絕受理
                </button>
              </div>
            )}

            {/* Inspection Section (Admin Only) */}
            {isAdmin && record && ticket.status === 'IN_PROGRESS' && !inspection && (
              <div className="bg-tertiary/5 p-6 rounded-3xl border border-tertiary/20 space-y-4 animate-in slide-in-from-right-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-tertiary">fact_check</span>
                  <h4 className="text-xs font-black text-tertiary uppercase tracking-widest">維修驗收 (Admin)</h4>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-tertiary/10 rounded-2xl border border-tertiary/10">
                    <p className="text-[11px] text-tertiary font-bold leading-relaxed">
                      請在確認收到修復設備後進行驗收，並上傳驗收照片。
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setInspectionForm({...inspectionForm, status: true})}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${inspectionForm.status ? 'bg-green-500 text-white shadow-md' : 'bg-white text-slate-400'}`}
                    >
                      通過
                    </button>
                    <button 
                      onClick={() => setInspectionForm({...inspectionForm, status: false})}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!inspectionForm.status ? 'bg-error text-white shadow-md' : 'bg-white text-slate-400'}`}
                    >
                      不通過
                    </button>
                  </div>
                  <textarea 
                    className="w-full bg-white border-0 rounded-xl p-3 text-xs min-h-[80px] focus:ring-1 focus:ring-tertiary"
                    placeholder="請填寫驗收意見..."
                    value={inspectionForm.note}
                    onChange={(e) => setInspectionForm({...inspectionForm, note: e.target.value})}
                  />
                  
                  {/* Unified Image Upload in Form */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-outline uppercase block">上傳驗收證明 (必填)</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedInspectionFiles.map((file, idx) => (
                        <div key={idx} className="w-10 h-10 rounded-lg bg-slate-100 border relative group overflow-hidden">
                          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                          <button 
                            onClick={() => setSelectedInspectionFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                      <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-outline group relative cursor-pointer border border-dashed border-outline/30 hover:border-tertiary/50 transition-colors">
                        <input 
                          type="file" 
                          multiple
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                          onChange={(e) => {
                            if (e.target.files) {
                              setSelectedInspectionFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                            }
                          }} 
                        />
                        <span className="material-symbols-outlined text-xs">add_a_photo</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleSubmitInspection}
                    disabled={isSubmitting || selectedInspectionFiles.length === 0}
                    className={`w-full py-3 text-white font-bold rounded-xl shadow-lg transition-all ${inspectionForm.status ? 'bg-tertiary shadow-tertiary/20' : 'bg-error shadow-error/20'}`}
                  >
                    {inspectionForm.status ? '驗收通過並結案' : '驗收不通過並送出'}
                  </button>
                </div>
              </div>
            )}

            {/* Inspection Results Display (Admin Only) */}
            {inspection && (
              <div className="bg-tertiary/5 p-6 rounded-3xl border border-tertiary/20 space-y-4 animate-in slide-in-from-right-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-tertiary">fact_check</span>
                  <h4 className="text-xs font-black text-tertiary uppercase tracking-widest">維修驗收結果</h4>
                </div>
                
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl flex items-center gap-3 ${inspection.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    <span className="material-symbols-outlined">
                      {inspection.status ? 'check_circle' : 'error'}
                    </span>
                    <span className="text-sm font-bold">{inspection.status ? '驗收通過' : '驗收不通過'}</span>
                  </div>
                  <div className="p-4 bg-white rounded-2xl text-xs text-on-surface-variant leading-relaxed italic">
                    "{inspection.note || '無驗收備註'}"
                  </div>
                  {/* Inspection Attachments Display */}
                  <div className="space-y-2 px-2">
                    <span className="text-[10px] font-bold text-outline uppercase block">驗收證明照片</span>
                    <div className="flex flex-wrap gap-2">
                      {attachments.filter(a => a.attachable_type === 'REPAIR_INSPECTION').map((file) => (
                        <div key={file.id} className="w-12 h-12 rounded-lg overflow-hidden border border-outline/10 cursor-pointer shadow-sm" onClick={() => window.open(file.file_url, '_blank')}>
                          <img src={file.file_url} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Audit Trail & Metadata */}
            <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/10 space-y-6">
              <div>
                <h4 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">流程紀錄</h4>
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-outline-variant/30">
                  <div className="relative">
                    <div className="absolute -left-[1.375rem] top-1 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm"></div>
                    <p className="text-xs font-bold text-on-surface">提交申請</p>
                    <p className="text-[10px] text-outline">{new Date(ticket.created_at).toLocaleString()}</p>
                  </div>
                  <div className="relative">
                    <div className={`absolute -left-[1.375rem] top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${ticket.status === 'OPEN' ? 'bg-slate-200' : 'bg-primary'}`}></div>
                    <p className={`text-xs font-bold ${ticket.status === 'OPEN' ? 'text-outline' : 'text-on-surface'}`}>目前狀態：{t(`ticketing.status.${ticket.status}`)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="text-lg font-bold text-error flex items-center gap-2">
                <span className="material-symbols-outlined">warning</span>
                確認拒絕此申請？
              </h3>
              <button onClick={() => setShowRejectModal(false)} className="text-outline hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-on-surface-variant font-medium">請輸入拒絕受理的原因，此訊息將同步發送給申請人：</p>
              <textarea 
                className="w-full bg-surface-container-low border-0 rounded-2xl p-4 text-sm min-h-[120px] focus:ring-2 focus:ring-error/20"
                placeholder="例如：非保固範圍設備、資訊填寫不全..."
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="p-6 bg-surface-container-lowest flex gap-3">
              <button 
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-3 bg-surface-container-high text-on-surface font-bold rounded-xl"
              >
                取消
              </button>
              <button 
                onClick={handleReject}
                disabled={isSubmitting || !rejectReason}
                className="flex-1 py-3 bg-error text-white font-bold rounded-xl shadow-lg shadow-error/20 hover:opacity-90 disabled:opacity-50 transition-all"
              >
                確認拒絕
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Feedback Dialog */}
      <FeedbackDialog
        {...feedbackState}
        onConfirm={() => {
          feedbackState.onConfirm?.();
          closeFeedback();
        }}
        onCancel={closeFeedback}
      />
    </DashboardLayout>
  );
};

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}
