import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = '', hover = false }: CardProps) {
  const baseClass = hover ? 'card-hover' : 'card';
  return <div className={`${baseClass} ${className}`}>{children}</div>;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
        {subtitle && <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    positive?: boolean;
  };
}

export function StatCard({ title, value, subtitle, icon, trend }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-stone-500">{title}</p>
          <p className="text-2xl font-semibold text-stone-900 mt-1">{value}</p>
          {subtitle && <p className="text-sm text-stone-500 mt-1">{subtitle}</p>}
          {trend && (
            <p
              className={`text-sm mt-1 ${
                trend.positive ? 'text-success-600' : 'text-error-600'
              }`}
            >
              {trend.positive ? '+' : ''}
              {trend.value}%
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-primary-50 rounded-lg text-primary-600">{icon}</div>
        )}
      </div>
    </Card>
  );
}
