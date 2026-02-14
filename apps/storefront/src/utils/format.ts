export function formatNZD(value: number | undefined | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatUSD(value: number | undefined | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCarats(carats: number | undefined | null): string {
  if (carats == null) return '—';
  return `${carats.toFixed(2)}ct`;
}

export function formatPercent(value: number | undefined | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMarkupRatio(ratio: number | undefined | null): string {
  if (ratio == null) return '—';
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatNumber(value: number | undefined | null, decimals = 2): string {
  if (value == null) return '—';
  return value.toFixed(decimals);
}

export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
