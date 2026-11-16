export type TableZone = 'ucl' | 'uel' | 'relegation' | 'none';

export interface LiveTableRow {
  rank: number;
  rankChange: number;
  espnId: string;
  clubName: string;
  shortName: string;
  abbreviation: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  zone: TableZone;
  zoneLabel: string | null;
  globeClubId: string | null;
}

export interface LiveMatchTeam {
  espnId: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logoUrl: string | null;
  score: string;
  winner: boolean;
  globeClubId: string | null;
}

export interface LiveMatchItem {
  id: string;
  dateIso: string;
  state: 'pre' | 'in' | 'post';
  statusDetail: string;
  statusShort: string;
  venue: string | null;
  home: LiveMatchTeam;
  away: LiveMatchTeam;
}

export interface LiveLeagueTableData {
  seasonLabel: string;
  fetchedAt: number;
  rows: LiveTableRow[];
}

export interface LiveMatchweekData {
  seasonLabel: string;
  fetchedAt: number;
  matches: LiveMatchItem[];
}

const ESPN_STANDINGS_URL =
  'https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings';
const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard';

const CLUB_NAME_TO_GLOBE_ID: Record<string, string> = {
  arsenal: 'arsenal',
  liverpool: 'liverpool',
  'manchester city': 'man-city',
  chelsea: 'chelsea',
  'aston villa': 'aston-villa',
  'newcastle united': 'newcastle',
  newcastle: 'newcastle',
  'tottenham hotspur': 'tottenham',
  tottenham: 'tottenham',
  'manchester united': 'man-utd',
  'brighton & hove albion': 'brighton',
  'brighton and hove albion': 'brighton',
  brighton: 'brighton',
  'nottingham forest': 'nottm-forest',
  'afc bournemouth': 'bournemouth',
  bournemouth: 'bournemouth',
  fulham: 'fulham',
  brentford: 'brentford',
  'west ham united': 'west-ham',
  'west ham': 'west-ham',
  'crystal palace': 'crystal-palace',
  'wolverhampton wanderers': 'wolves',
  wolves: 'wolves',
  everton: 'everton',
  'leicester city': 'leicester',
  leicester: 'leicester',
  'ipswich town': 'ipswich',
  ipswich: 'ipswich',
  southampton: 'southampton',
};

const ABBR_TO_GLOBE_ID: Record<string, string> = {
  ARS: 'arsenal',
  LIV: 'liverpool',
  MNC: 'man-city',
  MCI: 'man-city',
  CHE: 'chelsea',
  AVL: 'aston-villa',
  NEW: 'newcastle',
  TOT: 'tottenham',
  MAN: 'man-utd',
  MUN: 'man-utd',
  BHA: 'brighton',
  NFO: 'nottm-forest',
  BOU: 'bournemouth',
  FUL: 'fulham',
  BRE: 'brentford',
  WHU: 'west-ham',
  CRY: 'crystal-palace',
  WOL: 'wolves',
  EVE: 'everton',
  LEI: 'leicester',
  IPS: 'ipswich',
  SOU: 'southampton',
};

export function matchGlobeClubId(name: string, abbreviation?: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (CLUB_NAME_TO_GLOBE_ID[normalized]) {
    return CLUB_NAME_TO_GLOBE_ID[normalized];
  }
  if (abbreviation) {
    const abbrKey = abbreviation.trim().toUpperCase();
    if (ABBR_TO_GLOBE_ID[abbrKey]) {
      return ABBR_TO_GLOBE_ID[abbrKey];
    }
  }
  return null;
}

interface EspnStat {
  name?: string;
  value?: number;
  displayValue?: string;
}

interface EspnStandingsEntry {
  team?: {
    id?: string;
    displayName?: string;
    shortDisplayName?: string;
    name?: string;
    abbreviation?: string;
    logos?: Array<{ href?: string }>;
  };
  note?: {
    description?: string;
    rank?: number;
  };
  stats?: EspnStat[];
}

function getStatNum(stats: EspnStat[] | undefined, name: string, fallback = 0): number {
  const found = stats?.find((s) => s.name === name);
  return typeof found?.value === 'number' && Number.isFinite(found.value)
    ? found.value
    : fallback;
}

function classifyZone(description: string | undefined): { zone: TableZone; label: string | null } {
  if (!description) return { zone: 'none', label: null };
  const lower = description.toLowerCase();
  if (lower.includes('champions league')) {
    return { zone: 'ucl', label: description };
  }
  if (lower.includes('europa') || lower.includes('conference')) {
    return { zone: 'uel', label: description };
  }
  if (lower.includes('relegation')) {
    return { zone: 'relegation', label: description };
  }
  return { zone: 'none', label: description };
}

export async function fetchLivePremierLeagueTable(
  signal?: AbortSignal
): Promise<LiveLeagueTableData> {
  const res = await fetch(ESPN_STANDINGS_URL, {
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Standings request failed (${res.status})`);
  }

  const json = (await res.json()) as {
    name?: string;
    children?: Array<{
      name?: string;
      standings?: {
        seasonDisplayName?: string;
        entries?: EspnStandingsEntry[];
      };
    }>;
  };

  const leagueChild = json.children?.[0];
  const entries = leagueChild?.standings?.entries ?? [];
  if (entries.length === 0) {
    throw new Error('No Premier League standings entries returned');
  }

  const seasonLabel =
    leagueChild?.standings?.seasonDisplayName ||
    leagueChild?.name ||
    json.name ||
    'English Premier League';

  const rows: LiveTableRow[] = entries.map((entry, idx) => {
    const team = entry.team ?? {};
    const stats = entry.stats;
    const clubName = team.displayName || team.name || `Club ${idx + 1}`;
    const shortName = team.shortDisplayName || clubName;
    const abbreviation = team.abbreviation || shortName.slice(0, 3).toUpperCase();
    const { zone, label } = classifyZone(entry.note?.description);

    return {
      rank: getStatNum(stats, 'rank', idx + 1),
      rankChange: getStatNum(stats, 'rankChange', 0),
      espnId: team.id || `${idx}`,
      clubName,
      shortName,
      abbreviation,
      logoUrl: team.logos?.[0]?.href ?? null,
      played: getStatNum(stats, 'gamesPlayed', 0),
      wins: getStatNum(stats, 'wins', 0),
      draws: getStatNum(stats, 'ties', 0),
      losses: getStatNum(stats, 'losses', 0),
      goalsFor: getStatNum(stats, 'pointsFor', 0),
      goalsAgainst: getStatNum(stats, 'pointsAgainst', 0),
      goalDifference: getStatNum(stats, 'pointDifferential', 0),
      points: getStatNum(stats, 'points', 0),
      zone,
      zoneLabel: label,
      globeClubId: matchGlobeClubId(clubName, abbreviation),
    };
  });

  rows.sort((a, b) => a.rank - b.rank || b.points - a.points || b.goalDifference - a.goalDifference);

  return {
    seasonLabel,
    fetchedAt: Date.now(),
    rows,
  };
}

export async function fetchLivePremierLeagueMatches(
  signal?: AbortSignal
): Promise<LiveMatchweekData> {
  const res = await fetch(ESPN_SCOREBOARD_URL, {
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Matchweek request failed (${res.status})`);
  }

  const json = (await res.json()) as {
    leagues?: Array<{ name?: string; season?: { displayName?: string } }>;
    events?: Array<{
      id?: string;
      date?: string;
      status?: {
        type?: {
          state?: 'pre' | 'in' | 'post';
          detail?: string;
          shortDetail?: string;
        };
      };
      competitions?: Array<{
        venue?: { fullName?: string };
        competitors?: Array<{
          homeAway?: 'home' | 'away';
          score?: string;
          winner?: boolean;
          team?: {
            id?: string;
            displayName?: string;
            shortDisplayName?: string;
            abbreviation?: string;
            logo?: string;
          };
        }>;
      }>;
    }>;
  };

  const leagueInfo = json.leagues?.[0];
  const seasonLabel =
    leagueInfo?.season?.displayName || leagueInfo?.name || 'English Premier League';

  const matches: LiveMatchItem[] = [];
  for (const ev of json.events ?? []) {
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const homeRaw = competitors.find((c) => c.homeAway === 'home') ?? competitors[0];
    const awayRaw = competitors.find((c) => c.homeAway === 'away') ?? competitors[1];
    if (!homeRaw || !awayRaw) continue;

    const mapSide = (side: typeof homeRaw): LiveMatchTeam => {
      const name = side.team?.displayName || 'Club';
      const shortName = side.team?.shortDisplayName || name;
      const abbreviation = side.team?.abbreviation || shortName.slice(0, 3).toUpperCase();
      return {
        espnId: side.team?.id || shortName,
        name,
        shortName,
        abbreviation,
        logoUrl: side.team?.logo ?? null,
        score: side.score ?? '0',
        winner: Boolean(side.winner),
        globeClubId: matchGlobeClubId(name, abbreviation),
      };
    };

    const rawState = ev.status?.type?.state;
    const state: 'pre' | 'in' | 'post' =
      rawState === 'in' || rawState === 'post' ? rawState : 'pre';

    matches.push({
      id: ev.id || `${Math.random()}`,
      dateIso: ev.date || '',
      state,
      statusDetail: ev.status?.type?.detail || '',
      statusShort: ev.status?.type?.shortDetail || '',
      venue: comp?.venue?.fullName ?? null,
      home: mapSide(homeRaw),
      away: mapSide(awayRaw),
    });
  }

  return {
    seasonLabel,
    fetchedAt: Date.now(),
    matches,
  };
}
