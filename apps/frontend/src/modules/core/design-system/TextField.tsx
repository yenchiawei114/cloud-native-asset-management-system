import React, { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: string;
  helperText?: string;
}

/**
 * TextField 組件抽象化：封裝了標籤、圖示以及 Tailwind 的複雜樣式。
 * 使業務表單保持精簡且易於維修。
 */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, icon, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full group">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest ml-1 transition-colors group-focus-within:text-primary">
          {label}
        </label>
        <div className="relative bg-surface-container-highest rounded-lg border-b-2 border-transparent focus-within:border-primary transition-all">
          {icon && (
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-lg">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`w-full bg-transparent border-none py-4 ${
              icon ? 'pl-12' : 'pl-4'
            } pr-4 text-on-surface placeholder:text-outline/50 focus:ring-0 font-medium`}
            {...props}
          />
        </div>
      </div>
    );
  }
);

TextField.displayName = 'TextField';
