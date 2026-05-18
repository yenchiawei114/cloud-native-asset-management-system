import i18n from '../i18n';

export const getLocale = (): string => i18n.language;

export const fmtDate = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(getLocale());
};

export const fmtDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  return new Date(value).toLocaleString(getLocale());
};

export const fmtNumber = (value: number | null | undefined): string => {
  if (value == null) return '—';
  return value.toLocaleString(getLocale());
};
