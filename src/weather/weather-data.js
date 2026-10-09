export const HKO_SOURCE = Object.freeze({
  name: 'Hong Kong Observatory',
  shortName: 'HKO',
  apiUrl: 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php',
  openDataUrl: 'https://www.hko.gov.hk/en/weather-data-information/hong-kong-observatory-open-data',
  attribution: 'Weather data provided by the Hong Kong Observatory.',
});

export const DEMO_WEATHER_FIXTURE = Object.freeze({
  demo: true,
  fetchedAt: '2025-01-15T08:00:00+08:00',
  warningDataAvailable: true,
  warnings: [],
  current: {
    location: 'Hong Kong Observatory Headquarters',
    temperature: 22.4,
    feelsLike: 22.8,
    humidity: 71,
    wind: 'East 12 km/h',
    condition: 'Partly cloudy',
  },
  regional: [
    { name: 'Hong Kong Observatory', temperature: 22.4, humidity: 71, rainfall: 0 },
    { name: 'Sha Tin', temperature: 22.1, humidity: 73, rainfall: 0.2 },
    { name: 'Cheung Chau', temperature: 21.8, humidity: 76, rainfall: 0.4 },
  ],
  rainfall: {
    station: 'Hong Kong Observatory Headquarters',
    amount: 0,
    unit: 'mm',
    period: 'past hour',
  },
  climate: {
    station: 'Hong Kong Observatory Headquarters',
    month: 'January',
    metric: 'Rainfall',
    value: 0,
    percentile: 18,
    trend: 'Below the usual January range',
    historical: true,
  },
});

export function hkoApiUrl(dataType = 'flw', language = 'en') {
  return `${HKO_SOURCE.apiUrl}?${new URLSearchParams({ dataType, lang: language })}`;
}

export function formatUpdatedAt(value, locale = 'en-HK') {
  if (!value) return 'Update time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Update time unavailable';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Hong_Kong',
  }).format(date);
}

export function ageInMinutes(value, now = Date.now()) {
  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) return null;
  return Math.max(0, Math.floor((now - date) / 60000));
}

export function ageLabel(value, now = Date.now()) {
  const minutes = ageInMinutes(value, now);
  if (minutes === null) return 'Age unavailable';
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  return `Updated ${Math.floor(hours / 24)} days ago`;
}

export function freshnessState(snapshot, now = Date.now()) {
  if (!snapshot?.fetchedAt) return 'unavailable';
  const minutes = ageInMinutes(snapshot.fetchedAt, now);
  if (minutes === null) return 'unavailable';
  return minutes > 30 ? 'stale' : 'current';
}

function warningItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['warnings', 'warningSummary', 'warningInfo', 'items']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

export function normalizeWarnings(payload) {
  return warningItems(payload)
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: String(item.id ?? item.code ?? item.name ?? `hko-warning-${index + 1}`),
      title: String(item.title ?? item.name ?? item.warningMessage ?? 'HKO weather warning'),
      severity: item.severity ? String(item.severity) : null,
      instruction: item.instruction ? String(item.instruction) : null,
      issuedAt: item.issuedAt ?? item.issueTime ?? null,
      expiresAt: item.expiresAt ?? item.expireTime ?? null,
      sourceUrl: HKO_SOURCE.openDataUrl,
    }));
}

export function normalizeSnapshot(payload, options = {}) {
  const now = options.fetchedAt ?? new Date().toISOString();
  const warnings = normalizeWarnings(payload?.warnings ?? payload?.warningSummary ?? payload);
  const warningDataAvailable = payload?.warningDataAvailable === true
    || Array.isArray(payload?.warnings)
    || Array.isArray(payload?.warningSummary);
  return {
    demo: Boolean(options.demo),
    fetchedAt: payload?.fetchedAt ?? now,
    warningDataAvailable,
    warnings,
    current: payload?.current ?? null,
    regional: Array.isArray(payload?.regional) ? payload.regional : [],
    rainfall: payload?.rainfall ?? null,
    climate: payload?.climate ?? null,
  };
}

/**
 * Fetches one HKO endpoint. Failure is returned to the caller; this function
 * deliberately does not substitute fixture data for a failed live request.
 */
export async function fetchHkoJson(dataType = 'flw', language = 'en', fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable');
  const response = await fetchImpl(hkoApiUrl(dataType, language), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HKO request failed (${response.status})`);
  return response.json();
}

export function staleSnapshot(lastGoodSnapshot) {
  if (!lastGoodSnapshot) {
    return {
      demo: false,
      fetchedAt: null,
      warningDataAvailable: false,
      warnings: [],
      current: null,
      regional: [],
      rainfall: null,
      climate: null,
    };
  }
  return { ...lastGoodSnapshot, stale: true };
}

export function sourceLine(snapshot, now = Date.now()) {
  const state = freshnessState(snapshot, now);
  const freshness = state === 'stale' ? 'Outdated' : state === 'unavailable' ? 'Unavailable' : ageLabel(snapshot.fetchedAt, now);
  return { state, freshness, updated: formatUpdatedAt(snapshot.fetchedAt) };
}
