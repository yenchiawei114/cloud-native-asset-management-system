import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: string;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  icon, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-headline font-bold text-sm tracking-wide transition-all active:scale-[0.98]";
  
  const variants = {
    primary: "bg-gradient-to-r from-primary to-primary-container text-on-primary shadow-lg shadow-primary/10 hover:shadow-primary/20",
    secondary: "bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high",
    ghost: "bg-transparent text-primary hover:bg-primary/5"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      {...props}
    >
      <span>{children}</span>
      {icon && <span className="material-symbols-outlined text-lg">{icon}</span>}
    </button>
  );
};
