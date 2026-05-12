import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useUsers } from '../modules/users/hooks/useUsers';
import { User } from '../lib/api';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';

export const UserManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const { users, loading, deleteUser } = useUsers(searchTerm);
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    employees: users.filter(u => u.role === 'employee').length,
  };

  const handleDelete = (employeeId: string) => {
    showFeedback({
      title: '確認刪除',
      message: '確定要刪除此使用者嗎？此操作無法復原。',
      type: 'confirm',
      onConfirm: async () => {
        try {
          await deleteUser(employeeId);
          showFeedback({ title: '成功', message: '使用者已刪除', type: 'success', onConfirm: closeFeedback });
        } catch (err: any) {
          showFeedback({ title: '刪除失敗', message: `刪除失敗: ${err.message}`, type: 'error', onConfirm: closeFeedback });
        }
      },
      onCancel: closeFeedback
    });
  };

  return (
    <DashboardLayout activeTab="users">
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">{t('auth.nav.userManagement')}</h2>
            <p className="text-on-surface-variant text-sm max-w-2xl">{t('profile.managementDesc')}</p>
          </div>
          <button 
            onClick={() => navigate('/users/new')}
            className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-md font-bold text-sm shadow-lg shadow-primary/20 flex items-center space-x-2 transform transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>{t('profile.addUser')}</span>
          </button>
        </div>

        {/* Statistics Grid (Bento Style) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title={t('profile.stats.total')} value={stats.total} icon="groups" colorScheme="primary" />
          <StatCard title={t('profile.stats.admins')} value={stats.admins} icon="admin_panel_settings" colorScheme="secondary" />
          <StatCard title={t('profile.stats.employees')} value={stats.employees} icon="person" colorScheme="tertiary" />
        </div>

        {/* Main Table Area */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
          {/* Search/Filter Bar */}
          <div className="p-6 border-b border-outline-variant/10 bg-surface-container-low/30 flex items-center gap-4">
            <div className="relative max-w-xs w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
              <input 
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-md pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                placeholder={t('profile.searchPlaceholder')}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-6 py-4 text-[11px] font-extrabold text-outline uppercase tracking-widest border-b border-outline-variant/10">{t('profile.employeeId')}</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-outline uppercase tracking-widest border-b border-outline-variant/10">{t('profile.name')}</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-outline uppercase tracking-widest border-b border-outline-variant/10">{t('profile.email')}</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-outline uppercase tracking-widest border-b border-outline-variant/10 text-center">{t('profile.role')}</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-outline uppercase tracking-widest border-b border-outline-variant/10 text-right">{t('ticketing.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {loading ? (
                  <tr><td colSpan={5} className="py-20 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></td></tr>
                ) : users.length > 0 ? users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-container-low transition-colors group">
                    <td className="px-6 py-4 text-sm font-bold text-outline group-hover:text-primary transition-colors font-mono">{user.employee_id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${user.role === 'admin' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface'}`}>
                          {user.name.charAt(0)}
                        </div>
                        <span className="text-sm font-bold text-on-surface">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{user.email}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${user.role === 'admin' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                        {t(`profile.${user.role.toLowerCase()}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => navigate(`/users/${user.employee_id}`)}
                          className="p-1.5 text-outline hover:text-primary hover:bg-surface-container-highest rounded transition-all"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        <button 
                          onClick={() => handleDelete(user.employee_id)}
                          className="p-1.5 text-outline hover:text-error hover:bg-surface-container-highest rounded transition-all"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-outline">
                      <span className="material-symbols-outlined text-5xl mb-2">person_off</span>
                      <p>{t('profile.noUsersFound')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <FeedbackDialog 
        {...feedbackState} 
        onConfirm={() => {
          feedbackState.onConfirm?.();
          if (feedbackState.type !== 'confirm') closeFeedback();
        }}
        onCancel={closeFeedback}
      />
    </DashboardLayout>
  );
};

const StatCard: React.FC<{ title: string, value: number, icon: string, colorScheme: 'primary' | 'secondary' | 'tertiary' | 'error' }> = ({ title, value, icon, colorScheme }) => {
  const schemeMap = {
    primary: 'bg-primary/5 text-primary',
    secondary: 'bg-secondary-container/30 text-secondary',
    tertiary: 'bg-tertiary-fixed/10 text-tertiary',
    error: 'bg-error-container/10 text-error',
  };
  
  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10 flex items-center space-x-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${schemeMap[colorScheme]}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-bold text-outline uppercase tracking-widest">{title}</p>
        <p className="text-2xl font-extrabold text-on-surface leading-tight">{value.toLocaleString()}</p>
      </div>
    </div>
  );
};
