import type { ReactNode } from 'react';

interface GoldButtonProps {
  children: ReactNode;
  href?: string;
  className?: string;
}

export default function GoldButton({ children, href = '#', className = '' }: GoldButtonProps) {
  return (
    <a
      href={href}
      className={`inline-block border border-gold px-8 py-3 font-sans text-sm uppercase tracking-[0.12em] text-gold transition-all duration-500 hover:bg-gold hover:text-cream ${className}`}
    >
      {children}
    </a>
  );
}
