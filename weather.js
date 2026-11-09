// 판교 캠퍼스(금토로80번길 40) 근처의 예보를 서버에서만 받아 잠시 보관한다.
const LATITUDE = "37.4064";
const LONGITUDE = "127.0888";
const FRESH_FOR = 15 * 60 * 1000;
const MAX_AGE = 2 * 60 * 60 * 1000;
const RETRY_AFTER = 60 * 1000;

export function createWeatherService({ fetcher = fetch, now = Date.now, apiKey = process.env.OPEN_METEO_API_KEY } = {}) {
  let cached = null, pending = null, nextAttempt = 0, failed = false;

  async function fetchWeather() {
    const host = apiKey ? "customer-api.open-meteo.com" : "api.open-meteo.com";
    const url = new URL(`https://${host}/v1/forecast`);
    url.search = new URLSearchParams({
      latitude: LATITUDE, longitude: LONGITUDE, timezone: "Asia/Seoul", timeformat: "unixtime", forecast_days: "1",
      current: "temperature_2m,weather_code,cloud_cover,rain,snowfall",
      ...(apiKey ? { apikey: apiKey } : {}),
    }).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`weather status ${response.status}`);
    const current = (await response.json()).current;
    if (!current || !Number.isFinite(current.time) || !Number.isInteger(current.weather_code) ||
        !Number.isFinite(current.cloud_cover) || !Number.isFinite(current.temperature_2m)) {
      throw new Error("invalid weather response");
    }
    const forecastAt = current.time * 1000;
    if (!Number.isFinite(forecastAt) || now() - forecastAt > MAX_AGE || forecastAt - now() > 30 * 60 * 1000) {
      throw new Error("weather forecast is out of date");
    }
    return {
      code: current.weather_code,
      clouds: Math.max(0, Math.min(100, current.cloud_cover)),
      temperature: current.temperature_2m,
      forecastAt,
      fetchedAt: now(),
    };
  }

  function refresh() {
    if (pending || now() < nextAttempt) return pending;
    // 동시에 들어온 접속자가 외부 날씨 서비스를 여러 번 호출하지 않게 한다.
    pending = fetchWeather().then((weather) => {
      cached = weather; failed = false; nextAttempt = now() + FRESH_FOR;
    }).catch(() => {
      failed = true; nextAttempt = now() + RETRY_AFTER;
    }).finally(() => { pending = null; });
    return pending;
  }

  function snapshot() {
    refresh();
    const age = cached ? Math.max(0, now() - cached.fetchedAt) : Infinity;
    const forecastAge = cached ? Math.max(0, now() - cached.forecastAt) : Infinity;
    return {
      weather: cached && age <= MAX_AGE && forecastAge <= MAX_AGE ? { ...cached, stale: failed || age > FRESH_FOR } : null,
      lastWeatherAt: cached?.fetchedAt ?? null,
      status: failed ? "unavailable" : cached ? "ready" : "loading",
    };
  }

  return { snapshot, refresh };
}
