import type { ButtonHTMLAttributes } from 'react';

export default function Button({ className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-lg bg-emerald-800 px-4 py-2.5 font-medium text-white shadow-sm hover:bg-emerald-900 active:bg-emerald-950 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    />
  );
}
