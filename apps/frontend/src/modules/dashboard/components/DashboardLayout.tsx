import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, activeTab = 'assets' }) => {
  const { t } = useTranslation();
  const { logout, user } = useAuth();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('nav-collapsed') === '1';
  });

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('nav-collapsed', next ? '1' : '0');
      return next;
    });
  };

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const employeeNav = [
    { id: 'assets', label: t('auth.nav.myAssets'), icon: 'inventory_2', path: '/dashboard' },
    { id: 'profile', label: t('auth.nav.profile'), icon: 'person', path: '/profile' },
  ];

  const adminNav = [
    { id: 'all', label: t('auth.nav.allAssets'), icon: 'database', path: '/all-assets' },
    { id: 'audit', label: t('auth.nav.auditLogs'), icon: 'analytics', path: '/audit-logs' },
    { id: 'users', label: t('auth.nav.userManagement'), icon: 'manage_accounts', path: '/users' },
    { id: 'profile', label: t('auth.nav.profile'), icon: 'person', path: '/profile' },
  ];

  const navItems = isAdmin ? adminNav : employeeNav;
  const sidebarW = collapsed ? 'w-16' : 'w-72';
  const mainML = collapsed ? 'ml-16' : 'ml-72';

  return (
    <div className="h-screen bg-surface flex overflow-hidden">
      {/* Side Navigation */}
      <aside className={`h-screen ${sidebarW} fixed left-0 top-0 bg-slate-100 dark:bg-slate-950 flex flex-col py-6 px-3 gap-2 z-50 transition-all duration-200`}>
        {/* Brand + collapse toggle */}
        <div className={`mb-6 ${collapsed ? 'flex justify-center' : 'px-2'}`}>
          {collapsed ? (
            <button
              onClick={toggleCollapse}
              title={t('dashboard.expandNav')}
              className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity"
            >
              <span className="material-symbols-outlined text-on-primary-fixed" style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-primary-fixed" style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black tracking-tighter text-blue-800 dark:text-blue-200 whitespace-nowrap">Executive Architect</h2>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{t('dashboard.subBrand')}</p>
              </div>
              <button
                onClick={toggleCollapse}
                title={t('dashboard.collapseNav')}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                collapsed ? 'justify-center' : ''
              } ${
                activeTab === item.id
                  ? 'text-blue-700 dark:text-blue-400 font-bold border-l-4 border-blue-700 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20 translate-x-1'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === item.id ? "'FILL' 1" : "" }}>{item.icon}</span>
              {!collapsed && <span className="font-manrope text-sm font-medium">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-auto">
          <button
            onClick={logout}
            title={collapsed ? t('profile.logout') : undefined}
            className="w-full text-slate-500 hover:text-error hover:bg-error/5 py-2 px-3 rounded-lg font-medium text-xs transition-colors flex items-center gap-2 justify-center"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            {!collapsed && t('profile.logout')}
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className={`${mainML} flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-200`}>
        {/* Top Header Navigation */}
        <header className="bg-slate-50/85 dark:bg-slate-900/85 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm flex justify-between items-center w-full px-8 py-3">
          <div />
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const newLng = i18n.language === 'zh-TW' ? 'en-US' : 'zh-TW';
                i18n.changeLanguage(newLng);
                localStorage.setItem('lng', newLng);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors text-xs font-bold"
            >
              {i18n.language === 'zh-TW' ? 'EN' : '中'}
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-on-surface">{user?.name || 'Loading...'}</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase">{isAdmin ? t('profile.admin') : t('profile.employee')}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border-2 border-white shadow-sm uppercase">
                {user?.name?.substring(0, 2) || '??'}
              </div>
            </div>
          </div>
        </header>

        {/* Content Canvas */}
        <main className="p-8 bg-surface flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};
