interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'success' | 'warning' | 'error';
  className?: string;
}

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const variantClasses = {
  primary: 'bg-primary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
};

export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  size = 'md',
  variant = 'primary',
  className = '',
}: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full bg-stone-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`${sizeClasses[size]} ${variantClasses[variant]} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-stone-500 mt-1 text-right">{Math.round(percent)}%</p>
      )}
    </div>
  );
}

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'primary' | 'success' | 'warning' | 'error';
  showValue?: boolean;
  className?: string;
}

const ringVariantClasses = {
  primary: 'text-primary-500',
  success: 'text-success-500',
  warning: 'text-warning-500',
  error: 'text-error-500',
};

export function ProgressRing({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  variant = 'primary',
  showValue = true,
  className = '',
}: ProgressRingProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-stone-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${ringVariantClasses[variant]} transition-all duration-500 ease-out`}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            {Math.round(percent)}%
          </span>
        </div>
      )}
    </div>
  );
}

interface WorkerProgressProps {
  completed: number;
  failed: number;
  total: number;
  className?: string;
}

export function WorkerProgress({ completed, failed, total, className = '' }: WorkerProgressProps) {
  const completedPercent = (completed / total) * 100;
  const failedPercent = (failed / total) * 100;
  const runningPercent = 100 - completedPercent - failedPercent;

  return (
    <div className={`w-full ${className}`}>
      <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden flex">
        {completedPercent > 0 && (
          <div
            className="h-full bg-success-500 transition-all duration-300"
            style={{ width: `${completedPercent}%` }}
          />
        )}
        {failedPercent > 0 && (
          <div
            className="h-full bg-error-500 transition-all duration-300"
            style={{ width: `${failedPercent}%` }}
          />
        )}
        {runningPercent > 0 && total > completed + failed && (
          <div
            className="h-full bg-info-400 animate-pulse transition-all duration-300"
            style={{ width: `${runningPercent}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-stone-600 dark:text-stone-300 mt-1 flex-wrap gap-x-3">
        <span>{completed} completed ({Math.round(completedPercent)}%)</span>
        {failed > 0 && <span className="text-error-600 dark:text-error-400">{failed} failed ({Math.round(failedPercent)}%)</span>}
        <span>{total} total</span>
      </div>
    </div>
  );
}

interface RecordProgressProps {
  processed: number;
  total: number;
  className?: string;
}

export function RecordProgress({ processed, total, className = '' }: RecordProgressProps) {
  const processedPercent = total > 0 ? Math.min(100, (processed / total) * 100) : 0;

  return (
    <div className={`w-full ${className}`}>
      <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 transition-all duration-300"
          style={{ width: `${processedPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-stone-600 dark:text-stone-300 mt-1 flex-wrap gap-x-3">
        <span>{processed.toLocaleString()} records processed ({Math.round(processedPercent)}%)</span>
        <span>{total.toLocaleString()} total</span>
      </div>
    </div>
  );
}
