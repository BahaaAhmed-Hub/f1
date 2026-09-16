// Ergast/Jolpica-shaped payloads, trimmed to the fields the ETL reads.
export const schedule2026 = {
  MRData: {
    total: '2',
    RaceTable: {
      season: '2026',
      Races: [
        {
          season: '2026', round: '1', raceName: 'Australian Grand Prix',
          url: 'https://en.wikipedia.org/wiki/2026_Australian_Grand_Prix',
          date: '2026-03-08', time: '05:00:00Z',
          Circuit: {
            circuitId: 'albert_park', circuitName: 'Albert Park Grand Prix Circuit',
            Location: { lat: '-37.8497', long: '144.968', locality: 'Melbourne', country: 'Australia' },
          },
          FirstPractice:  { date: '2026-03-06', time: '01:30:00Z' },
          SecondPractice: { date: '2026-03-06', time: '05:00:00Z' },
          ThirdPractice:  { date: '2026-03-07', time: '01:30:00Z' },
          Qualifying:     { date: '2026-03-07', time: '05:00:00Z' },
        },
        {
          season: '2026', round: '2', raceName: 'Chinese Grand Prix',
          date: '2026-03-15', time: '07:00:00Z',
          Circuit: {
            circuitId: 'shanghai', circuitName: 'Shanghai International Circuit',
            Location: { lat: '31.3389', long: '121.22', locality: 'Shanghai', country: 'China' },
          },
          FirstPractice:    { date: '2026-03-13', time: '03:30:00Z' },
          SprintQualifying: { date: '2026-03-13', time: '07:30:00Z' },
          Sprint:           { date: '2026-03-14', time: '03:00:00Z' },
          Qualifying:       { date: '2026-03-14', time: '07:00:00Z' },
        },
      ],
    },
  },
};

const driver = (id, code, num, given, family) => ({
  driverId: id, permanentNumber: String(num), code,
  givenName: given, familyName: family, nationality: 'X', dateOfBirth: '1990-01-01',
});

export const raceResults = {
  MRData: {
    total: '1',
    RaceTable: {
      Races: [{
        season: '2026', round: '1', raceName: 'Australian Grand Prix', date: '2026-03-08',
        Circuit: { circuitId: 'albert_park', circuitName: 'Albert Park', Location: {} },
        Results: [
          {
            number: '63', position: '1', positionText: '1', points: '25',
            Driver: driver('russell', 'RUS', 63, 'George', 'Russell'),
            Constructor: { constructorId: 'mercedes', name: 'Mercedes', nationality: 'German' },
            grid: '1', laps: '58', status: 'Finished',
            Time: { millis: '4986802', time: '1:23:06.802' },
            FastestLap: { rank: '2', lap: '44', Time: { time: '1:19.813' },
                          AverageSpeed: { units: 'kph', speed: '238.083' } },
          },
          {
            number: '12', position: '2', positionText: '2', points: '18',
            Driver: driver('antonelli', 'ANT', 12, 'Kimi', 'Antonelli'),
            Constructor: { constructorId: 'mercedes', name: 'Mercedes', nationality: 'German' },
            grid: '2', laps: '58', status: 'Finished',
            // Real Jolpica publishes the gap already signed.
            Time: { millis: '2974', time: '+2.974' },
            FastestLap: { rank: '1', lap: '52', Time: { time: '1:19.401' },
                          AverageSpeed: { units: 'kph', speed: '239.318' } },
          },
          {
            number: '16', position: '3', positionText: '3', points: '15',
            Driver: driver('leclerc', 'LEC', 16, 'Charles', 'Leclerc'),
            Constructor: { constructorId: 'ferrari', name: 'Ferrari', nationality: 'Italian' },
            grid: '4', laps: '58', status: 'Finished',
            // ...though some rows come back unsigned, so both must work.
            Time: { millis: '15519', time: '15.519' },
          },
          {
            number: '3', position: '18', positionText: 'R', points: '0',
            Driver: driver('max_verstappen', 'VER', 3, 'Max', 'Verstappen'),
            Constructor: { constructorId: 'red_bull', name: 'Red Bull', nationality: 'Austrian' },
            grid: '3', laps: '31', status: 'Collision damage',
          },
        ],
      }],
    },
  },
};

export const qualifying = {
  MRData: {
    total: '1',
    RaceTable: {
      Races: [{
        season: '2026', round: '1', date: '2026-03-07',
        Circuit: { circuitId: 'albert_park', circuitName: 'Albert Park', Location: {} },
        QualifyingResults: [
          {
            number: '63', position: '1',
            Driver: driver('russell', 'RUS', 63, 'George', 'Russell'),
            Constructor: { constructorId: 'mercedes', name: 'Mercedes' },
            Q1: '1:16.123', Q2: '1:15.802', Q3: '1:15.223',
          },
          {
            number: '12', position: '2',
            Driver: driver('antonelli', 'ANT', 12, 'Kimi', 'Antonelli'),
            Constructor: { constructorId: 'mercedes', name: 'Mercedes' },
            Q1: '1:16.330', Q2: '1:15.912', Q3: '1:15.401',
          },
          {
            // Knocked out in Q1 — no Q2/Q3, which must stay null not zero.
            number: '31', position: '16',
            Driver: driver('ocon', 'OCO', 31, 'Esteban', 'Ocon'),
            Constructor: { constructorId: 'haas', name: 'Haas' },
            Q1: '1:17.004',
          },
        ],
      }],
    },
  },
};

export const driverStandings = {
  MRData: {
    total: '1',
    StandingsTable: {
      StandingsLists: [{
        season: '2026', round: '1',
        DriverStandings: [
          { position: '1', points: '25', wins: '1',
            Driver: driver('russell', 'RUS', 63, 'George', 'Russell'),
            Constructors: [{ constructorId: 'mercedes', name: 'Mercedes' }] },
          { position: '2', points: '18', wins: '0',
            Driver: driver('antonelli', 'ANT', 12, 'Kimi', 'Antonelli'),
            Constructors: [{ constructorId: 'mercedes', name: 'Mercedes' }] },
        ],
      }],
    },
  },
};

export const empty = { MRData: { total: '0', RaceTable: { Races: [] } } };
