import { ReactNode } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

type AlertVariant = 'success' | 'warning' | 'error' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

const variantStyles: Record<
  AlertVariant,
  { bg: string; border: string; icon: string; text: string }
> = {
  success: {
    bg: 'bg-success-50 dark:bg-success-500/10',
    border: 'border-success-200 dark:border-success-500/30',
    icon: 'text-success-500',
    text: 'text-success-800 dark:text-stone-100',
  },
  warning: {
    bg: 'bg-warning-50 dark:bg-warning-500/10',
    border: 'border-warning-200 dark:border-warning-500/30',
    icon: 'text-warning-500',
    text: 'text-warning-800 dark:text-stone-100',
  },
  error: {
    bg: 'bg-error-50 dark:bg-error-500/10',
    border: 'border-error-200 dark:border-error-500/30',
    icon: 'text-error-500',
    text: 'text-error-800 dark:text-stone-100',
  },
  info: {
    bg: 'bg-info-50 dark:bg-info-500/10',
    border: 'border-info-200 dark:border-info-500/30',
    icon: 'text-info-500',
    text: 'text-info-800 dark:text-stone-100',
  },
};

const icons: Record<AlertVariant, ReactNode> = {
  success: <CheckCircle className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  error: <AlertCircle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
};

export function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className = '',
}: AlertProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={`${styles.bg} ${styles.border} border rounded-lg p-4 ${className}`}
      role="alert"
    >
      <div className="flex">
        <div className={`flex-shrink-0 ${styles.icon}`}>{icons[variant]}</div>
        <div className="ml-3 flex-1">
          {title && <h3 className={`text-sm font-medium ${styles.text}`}>{title}</h3>}
          <div className={`text-sm ${styles.text} ${title ? 'mt-1' : ''}`}>{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`ml-auto -mx-1.5 -my-1.5 p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-stone-700/50 ${styles.icon}`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-stone-300 dark:text-stone-600 mb-4">{icon}</div>}
      <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">{title}</h3>
      {description && <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
