import React from 'react';
import { Button } from '../design-system/Button';

export interface FeedbackDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmText = '確定',
  cancelText = '取消',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <span className="material-symbols-outlined text-green-500 text-5xl">check_circle</span>;
      case 'error': return <span className="material-symbols-outlined text-red-500 text-5xl">error</span>;
      case 'confirm': return <span className="material-symbols-outlined text-amber-500 text-5xl">help</span>;
      default: return <span className="material-symbols-outlined text-blue-500 text-5xl">info</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center">
          <div className="mb-4 flex justify-center">
            {getIcon()}
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2">{title}</h3>
          <p className="text-slate-500 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="p-4 bg-slate-50 flex gap-3">
          {type === 'confirm' && (
            <button 
              onClick={onCancel}
              className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
            >
              {cancelText}
            </button>
          )}
          <div className="flex-1">
            <Button
              onClick={onConfirm}
              className="w-full"
              variant="primary"
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
