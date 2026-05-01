import React, { useState, useEffect } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useTranslation } from 'react-i18next';

interface NotificationSettingsProps {
  onLogout: () => void;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ onLogout }) => {
  const { t } = useTranslation();
  const { preferences, updatePreference } = useProfile();
  
  const [values, setValues] = useState<{ [key: string]: string }>({
    EMAIL: '',
    SLACK: '',
    TEAMS: ''
  });

  const [saving, setSaving] = useState<{ [key: string]: boolean }>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const newValues = { EMAIL: '', SLACK: '', TEAMS: '' };
    preferences.forEach(p => {
      if (p.type in newValues) {
        newValues[p.type as keyof typeof newValues] = p.value;
      }
    });
    setValues(newValues);
  }, [preferences]);

  const handleUpdate = async (type: string) => {
    setMessage(null);
    setSaving(prev => ({ ...prev, [type]: true }));
    try {
      await updatePreference(type, values[type]);
      setMessage({ type: 'success', text: t('profile.save') + '成功' });
    } catch (err: any) {
      const translatedMsg = t(`apiErrors.${err.message}`);
      setMessage({ 
        type: 'error', 
        text: translatedMsg !== `apiErrors.${err.message}` ? translatedMsg : (err.message || '更新失敗')
      });
    } finally {
      setSaving(prev => ({ ...prev, [type]: false }));
    }
  };

  return (
    <section className="bg-surface-container-high rounded-xl p-8 h-full border border-slate-100 flex flex-col">
      <div className="flex items-center gap-2 mb-8">
        <span className="material-symbols-outlined text-primary">notifications_active</span>
        <h2 className="text-xl font-bold text-on-surface">{t('profile.notificationTitle')}</h2>
      </div>

      <div className="space-y-8 flex-grow">
        <p className="text-sm text-on-surface-variant mb-4">{t('profile.notificationDesc')}</p>

        {message && (
          <div className={`p-3 rounded-lg text-xs font-bold animate-in fade-in slide-in-from-top-1 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message.text}
          </div>
        )}

        {/* Email */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-outline">mail</span>
            <label className="text-xs font-black uppercase tracking-widest text-outline">Email</label>
          </div>
          <div className="flex gap-2">
            <input 
              className="flex-grow bg-surface-container-highest border-none rounded-lg p-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary outline-none transition-all" 
              placeholder="example@company.com"
              value={values.EMAIL}
              onChange={(e) => setValues(prev => ({ ...prev, EMAIL: e.target.value }))}
            />
            <button 
              onClick={() => handleUpdate('EMAIL')}
              disabled={saving.EMAIL}
              className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
            >
              {saving.EMAIL ? '...' : t('profile.save')}
            </button>
          </div>
        </div>

        {/* Slack */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-outline">chat</span>
            <label className="text-xs font-black uppercase tracking-widest text-outline">Slack Webhook / ID</label>
          </div>
          <div className="flex gap-2">
            <input 
              className="flex-grow bg-surface-container-highest border-none rounded-lg p-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary outline-none transition-all" 
              placeholder="https://hooks.slack.com/..."
              value={values.SLACK}
              onChange={(e) => setValues(prev => ({ ...prev, SLACK: e.target.value }))}
            />
            <button 
              onClick={() => handleUpdate('SLACK')}
              disabled={saving.SLACK}
              className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
            >
              {saving.SLACK ? '...' : t('profile.save')}
            </button>
          </div>
        </div>

        {/* Teams */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-outline">groups</span>
            <label className="text-xs font-black uppercase tracking-widest text-outline">Teams Webhook</label>
          </div>
          <div className="flex gap-2">
            <input 
              className="flex-grow bg-surface-container-highest border-none rounded-lg p-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary outline-none transition-all" 
              placeholder="https://outlook.office.com/..."
              value={values.TEAMS}
              onChange={(e) => setValues(prev => ({ ...prev, TEAMS: e.target.value }))}
            />
            <button 
              onClick={() => handleUpdate('TEAMS')}
              disabled={saving.TEAMS}
              className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
            >
              {saving.TEAMS ? '...' : t('profile.save')}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 pt-8 border-t border-outline-variant/30 text-center">
        <button 
          onClick={onLogout}
          className="text-xs font-bold text-error uppercase tracking-widest hover:opacity-75 transition-opacity"
        >
          {t('profile.logout')}
        </button>
      </div>
    </section>
  );
};
