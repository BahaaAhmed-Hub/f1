// Bridges between the single-file frontend's ad-hoc keys and upstream (Ergast /
// Jolpica) identifiers. Kept in one place so the ETL and the seed generator
// can't drift apart.

/** Frontend circuit slug -> Ergast circuitId. */
export const CIRCUIT_TO_ERGAST = {
  australia: 'albert_park',      china: 'shanghai',        japan: 'suzuka',
  bahrain: 'bahrain',            saudi: 'jeddah',          miami: 'miami',
  canada: 'villeneuve',          monaco: 'monaco',         spain: 'catalunya',
  austria: 'red_bull_ring',      britain: 'silverstone',   belgium: 'spa',
  hungary: 'hungaroring',        netherlands: 'zandvoort', italy: 'monza',
  madrid: 'madring',             azerbaijan: 'baku',       singapore: 'marina_bay',
  usa: 'americas',               mexico: 'rodriguez',      brazil: 'interlagos',
  lasvegas: 'vegas',             qatar: 'losail',          abudhabi: 'yas_marina',
};

export const ERGAST_TO_CIRCUIT = Object.fromEntries(
  Object.entries(CIRCUIT_TO_ERGAST).map(([slug, ergast]) => [ergast, slug]));

// Ergast used a couple of older circuitIds for venues that later changed name.
export const ERGAST_CIRCUIT_ALIASES = {
  osterreichring: 'austria',   // A1-Ring, 2000–2003
  indianapolis: null,          // US GP 2000–2007, not on the 2026 map
  hockenheimring: null,
  nurburgring: null,
  magny_cours: null,
  istanbul: null,
  sepang: null,
  valencia: null,
  buddh: null,
  yeongam: null,
  ricard: null,
  sochi: null,
  imola: null,
  portimao: null,
  mugello: null,
  algarve: null,
  jerez: null,
  estoril: null,
  galvez: null,
};

/** Frontend team label -> Ergast constructorId. */
export const TEAM_TO_ERGAST = {
  'Mercedes': 'mercedes',          'Ferrari': 'ferrari',
  'McLaren': 'mclaren',            'Red Bull': 'red_bull',
  'Williams': 'williams',          'Aston Martin': 'aston_martin',
  'Cadillac': 'cadillac',          'Audi': 'audi',
  'Haas': 'haas',                  'Alpine': 'alpine',
  'RB': 'rb',                      'Alfa Romeo': 'alfa',
  'Force India': 'force_india',    'Renault': 'renault',
  'BAR': 'bar',                    'Jordan': 'jordan',
  'BMW': 'bmw_sauber',             'Brawn GP': 'brawn',
};

/**
 * Canonical team colours. The frontend's DRIVERS const stored a colour per
 * driver, which meant historic drivers overwrote their team's real colour with
 * a grey placeholder. Colours belong to the team, so they live here.
 */
export const TEAM_COLORS = {
  mercedes: '#00D7B6',   ferrari: '#ED1131',      mclaren: '#F47600',
  red_bull: '#4781D7',   williams: '#00A0DE',     aston_martin: '#229971',
  cadillac: '#909090',   audi: '#F50537',         haas: '#B6BABD',
  alpine: '#00A1E8',     rb: '#6692FF',           alfa: '#900000',
  alphatauri: '#2B4562', force_india: '#FF80C7',  racing_point: '#F596C8',
  renault: '#FFF500',    bar: '#D40000',          jordan: '#FFD700',
  bmw_sauber: '#0055A5', sauber: '#52E252',       brawn: '#B8FD6E',
  toyota: '#CC0000',     honda: '#006EB6',        toro_rosso: '#1E41FF',
  lotus_f1: '#FFB800',   lotus_racing: '#004225', caterham: '#0B361F',
  marussia: '#6E0000',   virgin: '#C40000',       hrt: '#B2945B',
  minardi: '#000000',    jaguar: '#0A5C36',       arrows: '#FA9E00',
  prost: '#0D1B4C',      benetton: '#00A550',     stewart: '#FFFFFF',
  spyker: '#FF6A00',     midland: '#F50537',      super_aguri: '#B40000',
  manor: '#E30613',      alphatauri_2020: '#2B4562',
};

/** Frontend display key -> Ergast driverId. */
export const DRIVER_TO_ERGAST = {
  Antonelli: 'antonelli',   Russell: 'russell',       Leclerc: 'leclerc',
  Hamilton: 'hamilton',     Norris: 'norris',         Piastri: 'piastri',
  Verstappen: 'max_verstappen', Hadjar: 'hadjar',     Sainz: 'sainz',
  Alonso: 'alonso',         Perez: 'perez',           Hulkenberg: 'hulkenberg',
  Ocon: 'ocon',             Gasly: 'gasly',           Albon: 'albon',
  Stroll: 'stroll',         Bottas: 'bottas',         Ricciardo: 'ricciardo',
  Vettel: 'vettel',         Raikkonen: 'raikkonen',   Rosberg: 'rosberg',
  Magnussen: 'kevin_magnussen', Tsunoda: 'tsunoda',   Lawson: 'lawson',
  Kvyat: 'kvyat',           Giovinazzi: 'giovinazzi', Zhou: 'zhou',
  Latifi: 'latifi',         Grosjean: 'grosjean',     Maldonado: 'maldonado',
  Sutil: 'sutil',           Schumacher: 'michael_schumacher',
  Barrichello: 'barrichello', Coulthard: 'coulthard', Hakkinen: 'hakkinen',
  Montoya: 'montoya',       Trulli: 'trulli',         Fisichella: 'fisichella',
  Irvine: 'irvine',         Villeneuve: 'villeneuve', Ralf: 'ralf_schumacher',
  Frentzen: 'frentzen',     Heidfeld: 'heidfeld',     Kovalainen: 'kovalainen',
  Kubica: 'kubica',         Button: 'button',         Webber: 'webber',
  Massa: 'massa',
};

export const ERGAST_TO_DRIVER = Object.fromEntries(
  Object.entries(DRIVER_TO_ERGAST).map(([key, id]) => [id, key]));

/**
 * The frontend renders by family name, but several family names are shared
 * across the 2000-2026 range, and display_key is unique. These are every
 * collision in that window; anyone else gets their family name.
 */
export const DISPLAY_KEY_OVERRIDES = {
  michael_schumacher: 'Schumacher',   // the 2000-2006 title era
  ralf_schumacher: 'Ralf',
  mick_schumacher: 'Mick',
  max_verstappen: 'Verstappen',
  jos_verstappen: 'Jos',
};

export function displayKeyFor(driverId, familyName) {
  return DISPLAY_KEY_OVERRIDES[driverId] ?? familyName;
}

/**
 * Last-resort disambiguator for a family name that turns out to be shared by
 * someone not in DISPLAY_KEY_OVERRIDES — prefer losing the short label over
 * failing the unique constraint mid-backfill.
 */
export function disambiguateDisplayKey(givenName, familyName) {
  return givenName ? `${givenName} ${familyName}` : familyName;
}

export const CIRCUIT_TYPE = {
  street: 'street', perm: 'permanent', semi: 'semi_permanent',
};
