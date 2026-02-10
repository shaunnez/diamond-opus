import { query } from '../client.js';

interface ExchangeRateRow {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: string;
  rate_date: string;
  fetched_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  rateDate: string;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function mapRowToExchangeRate(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    baseCurrency: row.base_currency,
    targetCurrency: row.target_currency,
    rate: parseFloat(row.rate),
    rateDate: row.rate_date,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertExchangeRate(
  baseCurrency: string,
  targetCurrency: string,
  rate: number,
  rateDate: string
): Promise<ExchangeRate> {
  const result = await query<ExchangeRateRow>(
    `INSERT INTO exchange_rates (base_currency, target_currency, rate, rate_date, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (base_currency, target_currency) DO UPDATE SET
       rate = EXCLUDED.rate,
       rate_date = EXCLUDED.rate_date,
       fetched_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [baseCurrency, targetCurrency, rate, rateDate]
  );
  return mapRowToExchangeRate(result.rows[0]!);
}

export async function getExchangeRate(
  baseCurrency: string,
  targetCurrency: string
): Promise<ExchangeRate | null> {
  const result = await query<ExchangeRateRow>(
    `SELECT * FROM exchange_rates WHERE base_currency = $1 AND target_currency = $2`,
    [baseCurrency, targetCurrency]
  );
  const row = result.rows[0];
  return row ? mapRowToExchangeRate(row) : null;
}
