import React, { useState, useRef, useEffect } from 'react';
import type { Vendor } from '../lib/api';

interface Props {
  vendors: Vendor[];
  value: string;
  onChange: (vendorName: string, vendorId: number) => void;
  required?: boolean;
  inputCls?: string;
}

export const VendorCombobox: React.FC<Props> = ({ vendors, value, onChange, required, inputCls }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [committed, setCommitted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedVendor = vendors.find(v => v.name === value) ?? null;

  const filtered = query.trim() === ''
    ? vendors
    : vendors.filter(v => v.name.toLowerCase().includes(query.toLowerCase()));

  const handleFocus = () => {
    setOpen(true);
    if (selectedVendor) setQuery('');
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setCommitted(false);
    onChange('', 0);
    setOpen(true);
  };

  const handleSelect = (vendor: Vendor) => {
    onChange(vendor.name, vendor.id);
    setQuery('');
    setCommitted(true);
    setOpen(false);
  };

  const handleBlur = () => {
    // 延遲關閉，讓 click on item 能先觸發
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        if (!committed) setQuery('');
      }
    }, 150);
  };

  useEffect(() => {
    // 當外部 value 被重設（如表單 reset）時同步狀態
    if (!value) {
      setQuery('');
      setCommitted(false);
    } else {
      setCommitted(true);
    }
  }, [value]);

  const cls = inputCls ?? 'w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none';

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        value={selectedVendor ? selectedVendor.name : query}
        onFocus={handleFocus}
        onChange={handleInput}
        onBlur={handleBlur}
        className={cls}
      />
      {/* 隱藏 input 供原生表單必填驗證 */}
      <input
        type="text"
        tabIndex={-1}
        required={required}
        value={value}
        onChange={() => {}}
        className="sr-only"
        aria-hidden
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-surface border border-outline-variant/30 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(v => (
            <li
              key={v.id}
              onMouseDown={() => handleSelect(v)}
              className={`px-3 py-2 text-sm cursor-pointer select-none hover:bg-primary/10 ${
                v.name === value ? 'bg-primary/15 font-semibold text-primary' : 'text-on-surface'
              }`}
            >
              {v.name}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-outline-variant/30 rounded-xl shadow-lg px-3 py-2 text-sm text-on-surface-variant">
          無符合廠商
        </div>
      )}
    </div>
  );
};
