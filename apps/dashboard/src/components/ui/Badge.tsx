import { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
  neutral: 'badge-neutral',
};

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return <span className={`${variantClasses[variant]} ${className}`}>{children}</span>;
}

// Specific badges for common statuses
export function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, BadgeVariant> = {
    running: 'info',
    completed: 'success',
    failed: 'error',
    partial: 'warning',
    stalled: 'error',
    available: 'success',
    on_hold: 'warning',
    sold: 'neutral',
    unavailable: 'error',
    active: 'success',
    deleted: 'error',
    pending: 'warning',
    confirmed: 'success',
  };

  return <Badge variant={statusMap[status] || 'neutral'}>{status}</Badge>;
}

export function RunTypeBadge({ type }: { type: 'full' | 'incremental' }) {
  return (
    <Badge variant={type === 'full' ? 'info' : 'neutral'}>
      {type}
    </Badge>
  );
}
