import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const variantConfig: Record<ToastVariant, { icon: typeof CheckCircle; bg: string; border: string; text: string; iconColor: string }> = {
  success: {
    icon: CheckCircle,
    bg: 'bg-success-50 dark:bg-success-500/10',
    border: 'border-success-200 dark:border-success-500/30',
    text: 'text-success-800 dark:text-success-400',
    iconColor: 'text-success-500',
  },
  error: {
    icon: XCircle,
    bg: 'bg-error-50 dark:bg-error-500/10',
    border: 'border-error-200 dark:border-error-500/30',
    text: 'text-error-800 dark:text-error-400',
    iconColor: 'text-error-500',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-warning-50 dark:bg-warning-500/10',
    border: 'border-warning-200 dark:border-warning-500/30',
    text: 'text-warning-800 dark:text-warning-400',
    iconColor: 'text-warning-500',
  },
  info: {
    icon: Info,
    bg: 'bg-info-50 dark:bg-info-500/10',
    border: 'border-info-200 dark:border-info-500/30',
    text: 'text-info-800 dark:text-info-400',
    iconColor: 'text-info-500',
  },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const config = variantConfig[toast.variant];
  const Icon = config.icon;

  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), toast.duration ?? 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg ${config.bg} ${config.border} animate-slide-in min-w-[320px] max-w-md`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${config.text}`}>{toast.title}</p>
        {toast.message && (
          <p className={`text-xs mt-0.5 ${config.text} opacity-80`}>{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className={`flex-shrink-0 ${config.text} opacity-60 hover:opacity-100 transition-opacity`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
