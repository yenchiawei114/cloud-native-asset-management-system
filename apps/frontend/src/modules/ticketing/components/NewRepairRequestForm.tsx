import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssets } from '../../assets/hooks/useAssets';
import { ticketService } from '../services/ticketService';
import { useAuth } from '../../auth/hooks/useAuth';
import { useFeedback } from '../../../modules/core/hooks/useFeedback';
import { FeedbackDialog } from '../../../modules/core/components/FeedbackDialog';

interface NewRepairRequestFormProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export const NewRepairRequestForm: React.FC<NewRepairRequestFormProps> = ({ onCancel, onSuccess }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { assets, loading: assetsLoading } = useAssets();
  
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [needBackup, setNeedBackup] = useState(false);
  const [backupSpec, setBackupSpec] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedAssetId) {
      showFeedback({ title: '請選擇設備', message: '請選擇要維修的設備', type: 'error', onConfirm: closeFeedback });
      return;
    }
    if (!description.trim()) {
      showFeedback({ title: '請填寫描述', message: '請填寫故障描述', type: 'error', onConfirm: closeFeedback });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const ticket = await ticketService.createTicket({
        asset_id: selectedAssetId,
        requester_id: user.id,
        description: description,
        need_backup: needBackup,
        backup_spec: needBackup ? backupSpec : null,
        expected_completion_date: null,
        pickup_location: null
      });

      for (const file of files) {
        await ticketService.uploadAttachment(ticket.id, file);
      }

      showFeedback({ 
        title: '提交成功', 
        message: '您的維修申請已成功送出，工作人員將儘速處理。', 
        type: 'success', 
        onConfirm: () => {
          closeFeedback();
          onSuccess();
        }
      });
    } catch (err: any) {
      showFeedback({ title: '提交失敗', message: err.message || '提交失敗，請重試', type: 'error', onConfirm: closeFeedback });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">建立維修申請單</h1>
        <p className="text-on-surface-variant mt-1">請填寫以下資訊，我們將儘速為您安排維修服務。</p>
      </div>


      <div className="space-y-8">
        {/* Section 1: Asset Selection */}
        <section className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <span className="h-6 w-1 bg-primary rounded-full"></span>
            <h2 className="text-lg font-bold tracking-tight text-on-surface">第一步：設備選擇</h2>
          </div>
          
          {assetsLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assets.map((asset) => (
                <div 
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  className={`relative p-4 rounded-xl cursor-pointer border-2 transition-all group ${
                    selectedAssetId === asset.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-slate-100 hover:border-primary/50 bg-surface-container-low/30'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg shadow-sm ${selectedAssetId === asset.id ? 'bg-white' : 'bg-white'}`}>
                      <span className={`material-symbols-outlined text-3xl ${selectedAssetId === asset.id ? 'text-primary' : 'text-slate-400 group-hover:text-primary transition-colors'}`}>
                        {asset.type.toLowerCase().includes('laptop') ? 'laptop_mac' : 'tablet_mac'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-on-surface">{asset.name}</h3>
                      <p className="text-[10px] text-slate-400 font-mono mb-2">SN: {asset.asset_code}</p>
                      <div className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        asset.status === 'in_use' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {t(`assets.status.${asset.status}`)}
                      </div>
                    </div>
                    {selectedAssetId === asset.id && (
                      <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Fault Description */}
        <section className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <span className="h-6 w-1 bg-primary rounded-full"></span>
            <h2 className="text-lg font-bold tracking-tight text-on-surface">第二步：故障描述</h2>
          </div>
          <div>
            <label className="block text-sm font-bold text-on-surface mb-3">詳細描述故障狀況 <span className="text-error">*</span></label>
            <textarea 
              className="w-full bg-slate-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-slate-400 min-h-[120px]" 
              placeholder="請描述設備出現的問題，例如：螢幕閃爍、無法開機、電池膨脹等..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 mt-2 italic flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">info</span>
              請儘可能詳細填寫，以便維修工程師進行初步判斷。
            </p>
          </div>
        </section>

        {/* Section 3: Attachments */}
        <section className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <span className="h-6 w-1 bg-primary rounded-full"></span>
            <h2 className="text-lg font-bold tracking-tight text-on-surface">第三步：附件上傳</h2>
          </div>
          <label className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer group block">
            <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileChange} />
            <span className="material-symbols-outlined text-4xl text-slate-300 group-hover:text-primary transition-colors mb-2">cloud_upload</span>
            <p className="text-on-surface font-bold">點擊或拖拽照片至此處</p>
            <p className="text-xs text-slate-400 mt-1">支援 JPG, PNG 格式，每個檔案不超過 5MB</p>
          </label>
          
          <div className="mt-6 space-y-3">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                    <span className="material-symbols-outlined">image</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface truncate max-w-[200px]">{file.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button 
                  onClick={() => removeFile(idx)}
                  className="text-slate-400 hover:text-error hover:bg-error/10 p-2 rounded-full transition-all"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Spare Machine */}
        <section className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <span className="h-6 w-1 bg-primary rounded-full"></span>
            <h2 className="text-lg font-bold tracking-tight text-on-surface">第四步：備用機需求</h2>
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl mb-6">
            <input 
              checked={needBackup} 
              onChange={(e) => setNeedBackup(e.target.checked)}
              className="w-5 h-5 text-primary border-slate-300 rounded focus:ring-primary/20" 
              id="spare-needed" 
              type="checkbox"
            />
            <label className="text-on-surface font-bold text-sm cursor-pointer" htmlFor="spare-needed">我需要申請備用機</label>
          </div>
          
          {needBackup && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-on-surface">最低效能需求與說明</label>
                <input 
                  className="w-full bg-slate-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 text-on-surface" 
                  type="text" 
                  placeholder="例如：32GB RAM, M1 Pro 或同等級..."
                  value={backupSpec}
                  onChange={(e) => setBackupSpec(e.target.value)}
                />
              </div>
            </div>
          )}
        </section>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4 py-8">
          <button 
            onClick={onCancel}
            className="px-8 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
          >
            取消申請
          </button>
          <button 
            onClick={handleSubmit}
            disabled={submitting}
            className="px-10 py-3 bg-gradient-to-br from-primary to-primary-container text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
          >
            {submitting ? '提交中...' : '送出維修申請'}
          </button>
        </div>
        <FeedbackDialog 
        {...feedbackState} 
        onConfirm={() => {
          feedbackState.onConfirm?.();
          closeFeedback();
        }}
        onCancel={closeFeedback}
      />
    </div>
    </div>
  );
};
