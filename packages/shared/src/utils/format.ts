export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parseCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCarats(carats: number): string {
  return carats.toFixed(2);
}
