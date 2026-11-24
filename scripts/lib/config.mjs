// Everything the site knows about its data: which official datasets, how to ask for them,
// how to turn their rows into series, and how each topic page shows them.
// Dataset ids, sources and cadences were checked against the live API catalogue on
// 24 November 2026 (meta=true on each request); the README lists them.

export const SITE_TITLE = 'Malaysia in Numbers';
export const SITE_TITLE_MS = 'Malaysia dalam Angka';
export const DEFAULT_SITE_URL = 'https://malaysia-in-numbers.pages.dev/';
export const REPO_URL = 'https://github.com/VinVirtual/malaysia-in-numbers';
export const SCHEMA_VERSION = 1;

export const API_HOST = 'api.data.gov.my';
export const API_DOCS = 'https://developer.data.gov.my/';
export const LICENCE = Object.freeze({ name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' });

// The API allows 4 requests a minute per client (developer.data.gov.my/rate-limit).
// One request every 16 s stays under it with a margin; a 429 waits for Retry-After (or 65 s).
export const LIMITS = Object.freeze({
  maxRequests: 16,
  maxBytes: 12 * 1024 * 1024,
  maxResponseBytes: 3 * 1024 * 1024,
  timeoutMs: 30_000,
  wallClockMs: 6 * 60_000,
  hostIntervalMs: { [API_HOST]: 16_000 },
  maxRetries: 1,
  maxRetryAfterMs: 65_000,
  cacheTtlMs: 6 * 60 * 60_000,
  rowLimit: 20_000,
});

export const USER_AGENT = 'malaysia-in-numbers/0.1 (static dashboard; +https://malaysia-in-numbers.pages.dev/)';

const FROM = '2015-01-01';

// endpoint: 'data-catalogue' or 'opendosm'. query: extra API parameters (filter, include...).
// extract: how rows become series. 'wide' takes columns of rows that match `where`;
// 'long' takes one value column, keyed by another column's value.
// Every series key is <dataset>.<name>; values are stored as numbers, dates as YYYY-MM-DD.
export const DATASETS = Object.freeze([
  {
    id: 'fuelprice',
    endpoint: 'data-catalogue',
    title: 'Price of petroleum and diesel',
    publisher: 'Ministry of Finance (MOF)',
    page: 'https://data.gov.my/data-catalogue/fuelprice',
    query: { filter: 'level@series_type', include: 'date,ron95,ron97,diesel,diesel_eastmsia,ron95_budi95' },
    from: null,
    period: 'week',
    extract: [{ type: 'wide', values: { ron95: 'ron95', ron97: 'ron97', diesel: 'diesel', diesel_east: 'diesel_eastmsia', ron95_budi95: 'ron95_budi95' } }],
  },
  {
    id: 'cpi_headline_inflation',
    endpoint: 'opendosm',
    title: 'Headline inflation by division',
    publisher: 'Department of Statistics Malaysia (DOSM)',
    page: 'https://open.dosm.gov.my/data-catalogue/cpi_headline_inflation',
    query: {},
    from: FROM,
    period: 'month',
    extract: [
      { type: 'long', keyCol: 'division', valueCol: 'inflation_yoy', prefix: 'yoy_' },
      { type: 'long', keyCol: 'division', valueCol: 'inflation_mom', prefix: 'mom_', keys: ['overall'] },
    ],
  },
  {
    id: 'lfs_month',
    endpoint: 'opendosm',
    title: 'Monthly principal labour force statistics',
    publisher: 'Department of Statistics Malaysia (DOSM)',
    page: 'https://open.dosm.gov.my/data-catalogue/lfs_month',
    query: {},
    from: FROM,
    period: 'month',
    extract: [{ type: 'wide', values: { u_rate: 'u_rate', p_rate: 'p_rate', lf: 'lf', employed: 'lf_employed', unemployed: 'lf_unemployed' } }],
  },
  {
    id: 'gdp_qtr_real',
    endpoint: 'opendosm',
    title: 'Quarterly GDP at constant prices',
    publisher: 'Department of Statistics Malaysia (DOSM)',
    page: 'https://open.dosm.gov.my/data-catalogue/gdp_qtr_real',
    query: {},
    from: FROM,
    period: 'quarter',
    extract: [{ type: 'long', keyCol: 'series', valueCol: 'value', keys: ['abs', 'growth_yoy', 'growth_qoq'] }],
  },
  {
    id: 'trade_sitc_1d',
    endpoint: 'opendosm',
    title: 'Monthly exports and imports by SITC section',
    publisher: 'Department of Statistics Malaysia (DOSM)',
    page: 'https://open.dosm.gov.my/data-catalogue/trade_sitc_1d',
    query: { filter: 'overall@section' },
    from: FROM,
    period: 'month',
    extract: [{ type: 'wide', values: { exports: 'exports', imports: 'imports' } }],
  },
  {
    id: 'exchangerates',
    endpoint: 'data-catalogue',
    title: 'Monthly exchange rates',
    publisher: 'Bank Negara Malaysia (BNM)',
    page: 'https://data.gov.my/data-catalogue/exchangerates',
    query: { filter: 'avg@indicator', include: 'date,usd,sgd,eur,cny,gbp,jpy' },
    from: FROM,
    period: 'month',
    extract: [{ type: 'wide', values: { usd: 'usd', sgd: 'sgd', eur: 'eur', cny: 'cny', gbp: 'gbp', jpy: 'jpy' } }],
  },
  {
    id: 'electricity_consumption',
    endpoint: 'data-catalogue',
    title: 'Monthly electricity consumption',
    publisher: 'TNB, SESB, Sarawak Energy, Energy Commission (ST) and DOSM',
    page: 'https://data.gov.my/data-catalogue/electricity_consumption',
    query: {},
    from: FROM,
    period: 'month',
    extract: [{ type: 'long', keyCol: 'sector', valueCol: 'consumption' }],
  },
  {
    id: 'population_malaysia',
    endpoint: 'opendosm',
    title: 'Population of Malaysia',
    publisher: 'Department of Statistics Malaysia (DOSM)',
    page: 'https://open.dosm.gov.my/data-catalogue/population_malaysia',
    query: { filter: 'overall@age,both@sex' },
    from: null,
    period: 'year',
    extract: [{ type: 'long', keyCol: 'ethnicity', valueCol: 'population' }],
  },
]);

export const DATASET_IDS = Object.freeze(DATASETS.map((d) => d.id));
export const datasetById = (id) => DATASETS.find((d) => d.id === id) ?? null;
