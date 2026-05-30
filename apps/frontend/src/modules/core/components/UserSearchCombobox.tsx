import React, { useState, useEffect, useRef } from 'react';
import { api, User } from '../../../lib/api';

interface UserSearchComboboxProps {
  label: string;
  selectedUser: User | null;
  onSelect: (user: User | null) => void;
  labelClassName?: string;
  wrapperClassName?: string;
  inputClassName?: string;
}

export const UserSearchCombobox: React.FC<UserSearchComboboxProps> = ({
  label,
  selectedUser,
  onSelect,
  labelClassName,
  wrapperClassName,
  inputClassName,
}) => {
  const [text, setText] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const didClearSelf = useRef(false);

  // 由外部清除選擇時同步顯示文字（例如「清空」按鈕）
  useEffect(() => {
    if (didClearSelf.current) {
      didClearSelf.current = false;
      return;
    }
    setText(selectedUser ? `${selectedUser.name}（${selectedUser.employee_id}）` : '');
    if (!selectedUser) {
      setResults([]);
      setOpen(false);
    }
  }, [selectedUser]);

  // 輸入防抖搜尋
  useEffect(() => {
    if (selectedUser || !text.trim()) {
      if (!text) { setResults([]); setOpen(false); }
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api.listUsers({ keyword: text.trim(), limit: 10 });
        setResults(data.items);
        setOpen(data.items.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, selectedUser]);

  // 點擊外部關閉並還原
  useEffect(() => {
    const onMousedown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setText(selectedUser ? `${selectedUser.name}（${selectedUser.employee_id}）` : '');
        if (!selectedUser) setResults([]);
      }
    };
    document.addEventListener('mousedown', onMousedown);
    return () => document.removeEventListener('mousedown', onMousedown);
  }, [selectedUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (selectedUser) {
      didClearSelf.current = true;
      onSelect(null);
    }
    setText(v);
    if (!v) { setResults([]); setOpen(false); }
  };

  const handleSelect = (u: User) => {
    onSelect(u);
    setOpen(false);
    setResults([]);
  };

  const handleClear = () => {
    didClearSelf.current = true;
    onSelect(null);
    setText('');
    setResults([]);
    setOpen(false);
  };

  const defaultInputCls =
    'w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none pr-8';

  return (
    <div ref={wrapperRef} className={wrapperClassName ?? 'space-y-1'}>
      <label className={labelClassName ?? 'text-[10px] font-bold text-on-surface-variant uppercase tracking-widest'}>
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={handleInputChange}
          onFocus={() => { if (results.length > 0 && !selectedUser) setOpen(true); }}
          className={inputClassName ?? defaultInputCls}
        />
        {(text || selectedUser) && (
          <button
            type="button"
            onMouseDown={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-sm leading-none">close</span>
          </button>
        )}
        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-surface border border-outline-variant/30 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map((u) => (
              <li
                key={u.id}
                onMouseDown={() => handleSelect(u)}
                className="px-3 py-2 text-sm hover:bg-surface-container cursor-pointer flex items-center gap-2"
              >
                <span className="font-medium text-on-surface">{u.name}</span>
                <span className="text-outline text-xs">{u.employee_id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
