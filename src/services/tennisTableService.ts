export type TennisTour = 'atp' | 'wta';

export interface TennisRankingRow {
  rank: number;
  previousRank: number;
  playerName: string;
  countryName: string;
  flagUrl: string | null;
  headshotUrl: string | null;
  points: number;
  globeClubId: string | null;
}

export interface TennisRankingsBundle {
  tour: TennisTour;
  title: string;
  fetchedAt: number;
  rows: TennisRankingRow[];
}

export interface TennisMatchSide {
  name: string;
  seed: number | null;
  rank: number | null;
  score: string;
  winner: boolean;
}

export interface TennisLiveMatch {
  id: string;
  tourLabel: string;
  tournamentName: string;
  competitionType: string;
  location: string;
  matchNote: string;
  state: 'pre' | 'in' | 'post';
  statusText: string;
  dateIso: string;
  home: TennisMatchSide;
  away: TennisMatchSide;
}

export interface TennisLiveMatchesBundle {
  fetchedAt: number;
  matches: TennisLiveMatch[];
}

const TENNIS_SCOREBOARD_URL =
  'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=tennis';

const COUNTRY_TO_GLOBE_ID: Record<string, string> = {
  spain: 'spain',
  esp: 'spain',
  italy: 'italy',
  ita: 'italy',
  'united states': 'usa',
  usa: 'usa',
  serbia: 'balkans',
  srb: 'balkans',
  greece: 'balkans',
  gre: 'balkans',
  croatia: 'balkans',
  cro: 'balkans',
  bulgaria: 'balkans',
  bul: 'balkans',
  germany: 'germany',
  ger: 'germany',
  'great britain': 'great-britain',
  'united kingdom': 'great-britain',
  gbr: 'great-britain',
  france: 'france',
  fra: 'france',
  australia: 'australia',
  aus: 'australia',
  russia: 'eurasia',
  rus: 'eurasia',
  belarus: 'eurasia',
  blr: 'eurasia',
  kazakhstan: 'eurasia',
  kaz: 'eurasia',
  poland: 'poland-central',
  pol: 'poland-central',
  'czech republic': 'poland-central',
  czechia: 'poland-central',
  cze: 'poland-central',
  switzerland: 'switzerland-nordics',
  sui: 'switzerland-nordics',
  norway: 'switzerland-nordics',
  nor: 'switzerland-nordics',
  denmark: 'switzerland-nordics',
  den: 'switzerland-nordics',
  finland: 'switzerland-nordics',
  fin: 'switzerland-nordics',
  sweden: 'switzerland-nordics',
  swe: 'switzerland-nordics',
  canada: 'canada',
  can: 'canada',
  argentina: 'south-america',
  arg: 'south-america',
  brazil: 'south-america',
  bra: 'south-america',
  chile: 'south-america',
  chi: 'south-america',
  china: 'asia-pacific',
  chn: 'asia-pacific',
  japan: 'asia-pacific',
  jpn: 'asia-pacific',
  india: 'asia-pacific',
  ind: 'asia-pacific',
  'chinese taipei': 'asia-pacific',
  tpe: 'asia-pacific',
};

export function matchTennisGlobeId(countryOrCode?: string): string | null {
  if (!countryOrCode) return null;
  const key = countryOrCode.trim().toLowerCase();
  return COUNTRY_TO_GLOBE_ID[key] ?? null;
}

export async function fetchLiveTennisRankings(
  tour: TennisTour,
  signal?: AbortSignal
): Promise<TennisRankingsBundle> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`;
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Tennis ${tour.toUpperCase()} rankings request failed (${res.status})`);
  }

  const json = (await res.json()) as {
    rankings?: Array<{
      name?: string;
      shortName?: string;
      ranks?: Array<{
        current?: number;
        previous?: number;
        points?: number;
        athlete?: {
          displayName?: string;
          flag?: string;
          flagAltText?: string;
          headshot?: string;
          citizenshipCountry?: string;
        };
      }>;
    }>;
  };

  const rankingBlock = json.rankings?.[0];
  const rawRanks = rankingBlock?.ranks ?? [];

  const rows: TennisRankingRow[] = rawRanks.slice(0, 50).map((item, idx) => {
    const athlete = item.athlete ?? {};
    const countryName = athlete.flagAltText || athlete.citizenshipCountry || '';
    const globeClubId =
      matchTennisGlobeId(athlete.flagAltText) ??
      matchTennisGlobeId(athlete.citizenshipCountry);

    return {
      rank: item.current ?? idx + 1,
      previousRank: item.previous ?? item.current ?? idx + 1,
      playerName: athlete.displayName || 'Player',
      countryName,
      flagUrl: athlete.flag ?? null,
      headshotUrl: athlete.headshot ?? null,
      points: item.points ?? 0,
      globeClubId,
    };
  });

  if (rows.length === 0) {
    throw new Error(`No ${tour.toUpperCase()} ranking entries returned`);
  }

  return {
    tour,
    title:
      tour === 'atp'
        ? 'ATP Singles World Rankings'
        : 'WTA Singles World Rankings',
    fetchedAt: Date.now(),
    rows,
  };
}

export async function fetchLiveTennisMatches(
  signal?: AbortSignal
): Promise<TennisLiveMatchesBundle> {
  const res = await fetch(TENNIS_SCOREBOARD_URL, {
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Tennis live scores request failed (${res.status})`);
  }

  const json = (await res.json()) as {
    sports?: Array<{
      leagues?: Array<{
        name?: string;
        shortName?: string;
        events?: Array<{
          id?: string;
          date?: string;
          name?: string;
          shortName?: string;
          location?: string;
          status?: string;
          summary?: string;
          competitionType?: {
            text?: string;
          };
          notes?: Array<{
            text?: string;
            type?: string;
          }>;
          fullStatus?: {
            type?: {
              state?: 'pre' | 'in' | 'post';
              detail?: string;
              shortDetail?: string;
            };
          };
          competitors?: Array<{
            homeAway?: string;
            displayName?: string;
            name?: string;
            score?: string;
            winner?: boolean;
            tournamentSeed?: number;
            rank?: number;
          }>;
        }>;
      }>;
    }>;
  };

  const leagues = json.sports?.[0]?.leagues ?? [];
  const matches: TennisLiveMatch[] = [];

  for (const league of leagues) {
    const tourLabel = league.shortName || league.name || 'Tour';
    for (const ev of league.events ?? []) {
      const comps = ev.competitors ?? [];
      if (comps.length < 2) continue;
      const homeRaw = comps.find((c) => c.homeAway === 'home') ?? comps[0];
      const awayRaw = comps.find((c) => c.homeAway === 'away') ?? comps[1];

      const mapSide = (side: typeof homeRaw): TennisMatchSide => ({
        name: side.displayName || side.name || 'Player',
        seed: typeof side.tournamentSeed === 'number' && side.tournamentSeed > 0 ? side.tournamentSeed : null,
        rank: typeof side.rank === 'number' && side.rank > 0 ? side.rank : null,
        score: side.score || (ev.status === 'pre' ? '' : '—'),
        winner: Boolean(side.winner),
      });

      const rawState = ev.fullStatus?.type?.state || ev.status;
      const state: 'pre' | 'in' | 'post' =
        rawState === 'in' || rawState === 'post' ? rawState : 'pre';

      const noteObj = ev.notes?.[0];
      const matchNote = noteObj?.type || noteObj?.text || '';

      matches.push({
        id: `${tourLabel}-${ev.id || `${homeRaw.name}-${awayRaw.name}`}`,
        tourLabel,
        tournamentName: ev.name || ev.shortName || `${tourLabel} Tour`,
        competitionType: ev.competitionType?.text || '',
        location: ev.location || '',
        matchNote,
        state,
        statusText:
          ev.fullStatus?.type?.detail ||
          ev.fullStatus?.type?.shortDetail ||
          ev.summary ||
          (state === 'in' ? 'Live' : state === 'post' ? 'Final' : 'Scheduled'),
        dateIso: ev.date || '',
        home: mapSide(homeRaw),
        away: mapSide(awayRaw),
      });
    }
  }

  const order = { in: 0, post: 1, pre: 2 };
  matches.sort((a, b) => order[a.state] - order[b.state]);

  return {
    fetchedAt: Date.now(),
    matches,
  };
}
