import { useTranslation } from 'react-i18next';

interface PaginationProps {
  total: number;
  skip: number;
  limit: number;
  onPageChange: (newSkip: number) => void;
}

export function Pagination({ total, skip, limit, onPageChange }: PaginationProps) {
  const { t } = useTranslation();

  if (total === 0) return null;

  const currentPage = Math.floor(skip / limit);
  const totalPages = Math.ceil(total / limit);
  const start = skip + 1;
  const end = Math.min(skip + limit, total);

  const btnCls = (disabled: boolean) =>
    `w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
      disabled
        ? 'text-on-surface-variant/30 cursor-default'
        : 'hover:bg-surface-container text-on-surface-variant'
    }`;

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-xs text-on-surface-variant">
        {t('common.paginationInfo', { start, end, total })}
      </span>
      <div className="flex items-center gap-1">
        <button
          className={btnCls(currentPage === 0)}
          onClick={() => onPageChange(0)}
          disabled={currentPage === 0}
          title={t('common.firstPage')}
        >
          <span className="material-symbols-outlined text-base">first_page</span>
        </button>
        <button
          className={btnCls(currentPage === 0)}
          onClick={() => onPageChange((currentPage - 1) * limit)}
          disabled={currentPage === 0}
          title={t('common.prevPage')}
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </button>
        <span className="px-3 text-xs font-semibold text-on-surface-variant">
          {t('common.pageOf', { current: currentPage + 1, total: totalPages })}
        </span>
        <button
          className={btnCls(currentPage >= totalPages - 1)}
          onClick={() => onPageChange((currentPage + 1) * limit)}
          disabled={currentPage >= totalPages - 1}
          title={t('common.nextPage')}
        >
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </button>
        <button
          className={btnCls(currentPage >= totalPages - 1)}
          onClick={() => onPageChange((totalPages - 1) * limit)}
          disabled={currentPage >= totalPages - 1}
          title={t('common.lastPage')}
        >
          <span className="material-symbols-outlined text-base">last_page</span>
        </button>
      </div>
    </div>
  );
}
