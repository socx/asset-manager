export function requireAccessToken(token: string | null | undefined): string {
  if (!token) throw new Error('Not authenticated');
  return token;
}

export function parseMoney(value: string): number | undefined {
  if (!value) return undefined;
  const cleaned = String(value).replace(/[£,\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function parseNumber(value: string): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/[ ,]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
}

export default {
  requireAccessToken,
  parseMoney,
  parseNumber,
  formatCurrency,
};
