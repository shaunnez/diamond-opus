import { createServiceLogger, notify, NotifyCategory, FRANKFURTER_API_URL, CURRENCY_REFRESH_INTERVAL_MS } from '@diamond/shared';
import { upsertExchangeRate, getExchangeRate } from '@diamond/database';

const logger = createServiceLogger('api', { component: 'currency' });

interface CachedRate {
  rate: number;
  rateDate: string;
  fetchedAt: Date;
}

let cachedNzdRate: CachedRate | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Returns the current USD-to-NZD rate from the in-memory cache.
 * Returns null if no rate has been loaded yet.
 */
export function getNzdRate(): number | null {
  return cachedNzdRate?.rate ?? null;
}

async function fetchAndCacheRate(): Promise<void> {
  try {
    const response = await fetch(FRANKFURTER_API_URL);
    if (!response.ok) {
      throw new Error(`Frankfurter API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as {
      amount: number;
      base: string;
      date: string;
      rates: Record<string, number>;
    };

    const nzdRate = data.rates.NZD;
    if (nzdRate === undefined) {
      throw new Error('NZD rate not found in Frankfurter API response');
    }

    await upsertExchangeRate('USD', 'NZD', nzdRate, data.date);

    cachedNzdRate = {
      rate: nzdRate,
      rateDate: data.date,
      fetchedAt: new Date(),
    };

    logger.info('USD-to-NZD rate updated', {
      rate: String(nzdRate),
      rateDate: data.date,
    });
  } catch (error) {
    logger.error('Failed to fetch exchange rate', error);
    notify({
      category: NotifyCategory.EXTERNAL_SERVICE_ERROR,
      title: 'Currency Rate Fetch Failed',
      message: 'Failed to fetch USD-to-NZD exchange rate from Frankfurter API. The API will continue using the last known rate from the database.',
      context: { service: 'currency' },
      error,
    }).catch(() => {});
    await loadRateFromDb();
  }
}

async function loadRateFromDb(): Promise<void> {
  try {
    const dbRate = await getExchangeRate('USD', 'NZD');
    if (dbRate) {
      cachedNzdRate = {
        rate: dbRate.rate,
        rateDate: dbRate.rateDate,
        fetchedAt: dbRate.fetchedAt,
      };
      logger.info('Loaded exchange rate from database', {
        rate: String(dbRate.rate),
        rateDate: dbRate.rateDate,
      });
    } else {
      logger.warn('No exchange rate found in database');
    }
  } catch (error) {
    logger.error('Failed to load exchange rate from database', error);
  }
}

/**
 * Initialize the currency service:
 * 1. Fetch latest rate from Frankfurter API
 * 2. If that fails, load last known rate from database
 * 3. Set up 24-hour refresh interval
 */
export async function initCurrencyService(): Promise<void> {
  logger.info('Initializing currency service');

  await fetchAndCacheRate();

  refreshTimer = setInterval(fetchAndCacheRate, CURRENCY_REFRESH_INTERVAL_MS);
  if (refreshTimer.unref) {
    refreshTimer.unref();
  }

  logger.info('Currency service initialized', {
    hasRate: String(cachedNzdRate !== null),
    rate: String(cachedNzdRate?.rate ?? 'none'),
  });
}

/**
 * Stop the currency service refresh timer.
 */
export function stopCurrencyService(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
