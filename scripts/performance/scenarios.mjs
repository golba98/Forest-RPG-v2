/** The manifest is data: changing a duration or fixture is visible in every run's output. */
export function scenarios(fixtures) {
  const scene = fixtures['42'];
  const basic = {
    seed: 42,
    viewport: { width: 1920, height: 1080 },
    dpr: 1,
    zoom: 2,
    cap: 0,
    weather: 'clear',
    sensitivity: 5,
  };
  const cases = [];
  const add = (name, duration, extra = {}) =>
    cases.push({ ...basic, name, durationMs: duration, ...extra });
  add('A-idle', 120000, { position: scene.forest ?? scene.dense, gpu: true });
  add('B-explore', 300000, { route: true });
  add('B-explore-gpu', 120000, { route: true, gpu: true });
  add('C-fast', 180000, { route: true, fast: true, kit: true, sensitivity: 10 });
  add('F-dense', 120000, { position: scene.dense, gpu: true });
  add('G-bridge', 120000, { position: scene.bridge, localRoute: true, gpu: true });
  add('G-hill', 120000, { position: scene.hill, gpu: true });
  add('H-combat', 120000, { combat: true, kit: true, gpu: true });
  add('H-combat-waves', 120000, { combat: true, kit: true, combatWaves: true, gpu: true });
  for (const weather of ['clear', 'rain'])
    add('I-' + weather, 120000, { position: scene.bridge, weather, gpu: true });
  add('I-clear-no-gpu', 120000, { position: scene.bridge, weather: 'clear', gpu: false });
  add('I-rain-no-clouds', 120000, {
    position: scene.bridge,
    weather: 'rain',
    clouds: false,
    gpu: true,
  });
  add('I-rain-no-particles', 120000, {
    position: scene.bridge,
    weather: 'rain',
    particles: false,
    gpu: true,
  });
  for (const [tag, position] of [
    ['northwest', { x: -1000000000.5, y: -1000000000.5 }],
    ['southeast', { x: 1000000000.5, y: 1000000000.5 }],
  ])
    add('K-' + tag, 120000, { position, localRoute: true });
  for (const seed of [123, 1337]) {
    add('A-seed-' + seed, 120000, {
      seed,
      position: fixtures[String(seed)].forest ?? fixtures[String(seed)].dense,
    });
    add('F-dense-seed-' + seed, 120000, { seed, position: fixtures[String(seed)].dense });
    add('G-bridge-seed-' + seed, 120000, {
      seed,
      position: fixtures[String(seed)].bridge,
      localRoute: true,
    });
  }
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ])
    for (const kind of ['idle', 'rain']) {
      add('L-viewport-' + width + '-' + kind, 60000, {
        viewport: { width, height },
        weather: kind === 'rain' ? 'rain' : 'clear',
        position: kind === 'rain' ? scene.bridge : scene.dense,
        gpu: true,
      });
    }
  for (const dpr of [1, 1.5, 2])
    for (const kind of ['idle', 'rain']) {
      add('L-fixed-footprint-dpr' + dpr + '-' + kind, 60000, {
        viewport: { width: 1280, height: 720 },
        dpr,
        weather: kind === 'rain' ? 'rain' : 'clear',
        position: kind === 'rain' ? scene.bridge : scene.dense,
        gpu: true,
      });
    }
  for (const kind of ['idle', 'explore', 'rain'])
    add('L-shipped-1440-' + kind, kind === 'explore' ? 180000 : 60000, {
      viewport: { width: 1920, height: 1080 },
      dpr: 4 / 3,
      fullscreen: true,
      zoom: 'auto',
      cap: 60,
      route: kind === 'explore',
      weather: kind === 'rain' ? 'rain' : 'clear',
      position: kind === 'rain' ? scene.bridge : kind === 'idle' ? scene.dense : undefined,
      gpu: kind !== 'explore',
    });
  for (const cap of [60, 120])
    add('A-capped-' + cap, 120000, { cap, position: scene.forest ?? scene.dense });
  // Repeat headline comparisons; label exploratory controls as single-pass measurements.
  for (const scenario of cases)
    scenario.repetitions =
      /^(A-idle|B-explore|C-fast|F-dense|G-bridge|G-hill|H-combat|H-combat-waves|I-clear|I-rain|A-capped-120)$/.test(
        scenario.name,
      ) || scenario.name.startsWith('L-shipped-1440-')
        ? 3
        : 1;
  return cases;
}
