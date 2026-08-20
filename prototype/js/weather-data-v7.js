// Weather Card v7 provider orchestration.
// A single optional provider must never erase other verified evidence.

const inKorea = (lat, lon) => Number(lat) >= 32.5 && Number(lat) <= 39
  && Number(lon) >= 124 && Number(lon) <= 132.5;

const errorText = error => String(error?.message || error || 'PROVIDER_FAILED').slice(0, 160);

export async function loadWeatherInputsV7(location, deps = {}) {
  if (location?.lat === null || location?.lat === undefined
      || location?.lon === null || location?.lon === undefined) {
    throw new Error('WEATHER_LOCATION_INVALID');
  }
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('WEATHER_LOCATION_INVALID');

  const local = inKorea(lat, lon);
  const jobs = {
    openMeteo: () => deps.fetchWeather?.(lat, lon),
    warningGate: () => deps.fetchWarningGate?.({ lat, lon }),
    marine: () => deps.fetchMarine?.(lat, lon),
    ...(local ? {
      kmaForecast: () => deps.fetchKmaForecast?.(lat, lon),
      kmaObservation: () => deps.fetchKorea?.('aws'),
      airObservation: () => deps.fetchKorea?.('airobs'),
      uvIndex: () => deps.fetchKorea?.('life'),
    } : {}),
  };
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(names.map(name => Promise.resolve().then(jobs[name])));
  const values = {};
  const errors = {};
  settled.forEach((result, index) => {
    const name = names[index];
    if (result.status === 'fulfilled') values[name] = result.value ?? null;
    else {
      values[name] = null;
      errors[name] = errorText(result.reason);
    }
  });

  return {
    location: {
      name: location?.name || null,
      lat,
      lon,
      region: location?.region || null,
    },
    openMeteo: values.openMeteo ?? null,
    warningGate: values.warningGate ?? null,
    marine: values.marine ?? null,
    kmaForecast: values.kmaForecast ?? null,
    kmaObservation: values.kmaObservation ?? null,
    airObservation: values.airObservation ?? null,
    uvIndex: values.uvIndex ?? null,
    errors,
  };
}
