export type CricketFormat = 'test' | 'odi' | 't20i';

export interface CricketRankingRow {
  rank: number;
  teamName: string;
  flagUrl: string | null;
  matches: number;
  points: number;
  rating: number;
  globeClubId: string | null;
}

export interface CricketRankingsBundle {
  format: CricketFormat;
  title: string;
  fetchedAt: number;
  rows: CricketRankingRow[];
}

export interface CricketMatchSide {
  name: string;
  abbreviation: string;
  logoUrl: string | null;
  score: string;
  winner: boolean;
  globeClubId: string | null;
}

export interface CricketLiveMatch {
  id: string;
  seriesName: string;
  matchNote: string;
  state: 'pre' | 'in' | 'post';
  statusText: string;
  dateIso: string;
  home: CricketMatchSide;
  away: CricketMatchSide;
}

export interface CricketLiveMatchesBundle {
  fetchedAt: number;
  matches: CricketLiveMatch[];
}

const CRICKET_SCOREBOARD_URL =
  'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket';

const ICC_WIKI_PAGES: Record<CricketFormat, { page: string; title: string }> = {
  test: {
    page: "ICC_Men's_Test_Team_Rankings",
    title: "ICC Men's Test Team Rankings",
  },
  odi: {
    page: "ICC_Men's_ODI_Team_Rankings",
    title: "ICC Men's ODI Team Rankings",
  },
  t20i: {
    page: "ICC_Men's_T20I_Team_Rankings",
    title: "ICC Men's T20I Team Rankings",
  },
};

const TEAM_NAME_TO_GLOBE_ID: Record<string, string> = {
  india: 'india',
  australia: 'australia',
  england: 'england',
  'south africa': 'south-africa',
  'new zealand': 'new-zealand',
  pakistan: 'pakistan',
  'sri lanka': 'sri-lanka',
  'west indies': 'west-indies',
  bangladesh: 'bangladesh',
  afghanistan: 'afghanistan',
  ireland: 'ireland',
  zimbabwe: 'zimbabwe',
  netherlands: 'netherlands',
  scotland: 'scotland',
  'united states': 'usa',
  'u.s.a.': 'usa',
  usa: 'usa',
  nepal: 'nepal',
};

const ABBR_TO_GLOBE_ID: Record<string, string> = {
  IND: 'india',
  AUS: 'australia',
  ENG: 'england',
  SA: 'south-africa',
  RSA: 'south-africa',
  NZ: 'new-zealand',
  NZL: 'new-zealand',
  PAK: 'pakistan',
  SL: 'sri-lanka',
  SRL: 'sri-lanka',
  WI: 'west-indies',
  WIN: 'west-indies',
  BAN: 'bangladesh',
  AFG: 'afghanistan',
  IRE: 'ireland',
  ZIM: 'zimbabwe',
  NED: 'netherlands',
  SCO: 'scotland',
  USA: 'usa',
  NEP: 'nepal',
};

export function matchCricketGlobeId(name: string, abbr?: string): string | null {
  const clean = name.replace(/\[.*?\]/g, '').trim().toLowerCase();
  if (TEAM_NAME_TO_GLOBE_ID[clean]) return TEAM_NAME_TO_GLOBE_ID[clean];
  if (abbr) {
    const a = abbr.trim().toUpperCase();
    if (ABBR_TO_GLOBE_ID[a]) return ABBR_TO_GLOBE_ID[a];
  }
  return null;
}

function parseIntSafe(raw: string): number {
  const num = parseInt(raw.replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(num) ? num : 0;
}

export async function fetchLiveIccRankings(
  format: CricketFormat,
  signal?: AbortSignal
): Promise<CricketRankingsBundle> {
  const meta = ICC_WIKI_PAGES[format];
  const url =
    `https://en.wikipedia.org/w/api.php?action=parse` +
    `&page=${encodeURIComponent(meta.page)}` +
    `&prop=text&format=json&origin=*`;

  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`ICC rankings request failed (${res.status})`);
  }

  const text = await res.text();
  if (!text.startsWith('{')) {
    throw new Error('Unexpected response from ICC rankings feed');
  }

  const data = JSON.parse(text) as { parse?: { text?: { '*'?: string } } };
  const html = data?.parse?.text?.['*'];
  if (!html) {
    throw new Error('ICC rankings table unavailable');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table.wikitable'));
  const targetTable =
    tables.find((tbl) => {
      const headers = Array.from(tbl.querySelectorAll('th')).map((th) =>
        (th.textContent || '').trim().toLowerCase()
      );
      return headers.includes('team') && headers.includes('rating');
    }) ?? tables[0];

  if (!targetTable) {
    throw new Error('Could not locate ICC rankings table');
  }

  const rows: CricketRankingRow[] = [];
  const trs = Array.from(targetTable.querySelectorAll('tbody tr, tr'));

  let rankCounter = 0;
  for (const tr of trs) {
    const tds = Array.from(tr.querySelectorAll('td'));
    if (tds.length < 4) continue;

    // Some tables include Rank in col 0, others use CSS static-row-numbers (col 0 = Team)
    const firstIsNum = /^\d+$/.test((tds[0].textContent || '').trim());
    const teamTd = firstIsNum ? tds[1] : tds[0];
    const matchesTd = firstIsNum ? tds[2] : tds[1];
    const pointsTd = firstIsNum ? tds[3] : tds[2];
    const ratingTd = firstIsNum ? tds[4] : tds[3];

    if (!teamTd || !matchesTd || !pointsTd || !ratingTd) continue;

    rankCounter += 1;
    const rank = firstIsNum ? parseIntSafe(tds[0].textContent || '') : rankCounter;
    const anchorText = teamTd.querySelector('a')?.textContent?.trim();
    const rawTeamName = (anchorText || teamTd.textContent || '')
      .replace(/\[.*?\]/g, '')
      .trim();
    if (!rawTeamName) continue;

    const imgEl = teamTd.querySelector('img');
    const rawSrc = imgEl?.getAttribute('src') || null;
    const flagUrl = rawSrc
      ? rawSrc.startsWith('//')
        ? `https:${rawSrc}`
        : rawSrc
      : null;

    rows.push({
      rank,
      teamName: rawTeamName,
      flagUrl,
      matches: parseIntSafe(matchesTd.textContent || ''),
      points: parseIntSafe(pointsTd.textContent || ''),
      rating: parseIntSafe(ratingTd.textContent || ''),
      globeClubId: matchCricketGlobeId(rawTeamName),
    });
  }

  if (rows.length === 0) {
    throw new Error('No ICC ranking entries parsed');
  }

  return {
    format,
    title: meta.title,
    fetchedAt: Date.now(),
    rows,
  };
}

export async function fetchLiveCricketMatches(
  signal?: AbortSignal
): Promise<CricketLiveMatchesBundle> {
  const res = await fetch(CRICKET_SCOREBOARD_URL, {
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Cricket live scores request failed (${res.status})`);
  }

  const json = (await res.json()) as {
    sports?: Array<{
      leagues?: Array<{
        name?: string;
        shortName?: string;
        events?: Array<{
          id?: string;
          date?: string;
          status?: string;
          summary?: string;
          note?: string;
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
            abbreviation?: string;
            logo?: string;
            score?: string;
            winner?: boolean;
          }>;
        }>;
      }>;
    }>;
  };

  const leagues = json.sports?.[0]?.leagues ?? [];
  const matches: CricketLiveMatch[] = [];

  for (const league of leagues) {
    const seriesName = league.name || league.shortName || 'International Cricket';
    for (const ev of league.events ?? []) {
      const comps = ev.competitors ?? [];
      if (comps.length < 2) continue;
      const homeRaw = comps.find((c) => c.homeAway === 'home') ?? comps[0];
      const awayRaw = comps.find((c) => c.homeAway === 'away') ?? comps[1];

      const mapSide = (side: typeof homeRaw): CricketMatchSide => {
        const name = side.displayName || side.name || 'Team';
        const abbreviation = side.abbreviation || name.slice(0, 3).toUpperCase();
        return {
          name,
          abbreviation,
          logoUrl: side.logo ?? null,
          score: side.score || (ev.status === 'pre' ? '' : '—'),
          winner: Boolean(side.winner),
          globeClubId: matchCricketGlobeId(name, abbreviation),
        };
      };

      const rawState = ev.fullStatus?.type?.state || ev.status;
      const state: 'pre' | 'in' | 'post' =
        rawState === 'in' || rawState === 'post' ? rawState : 'pre';

      matches.push({
        id: ev.id || `${seriesName}-${homeRaw.name}-${awayRaw.name}`,
        seriesName,
        matchNote: ev.note || ev.summary || '',
        state,
        statusText:
          ev.fullStatus?.type?.detail ||
          ev.fullStatus?.type?.shortDetail ||
          ev.summary ||
          (state === 'in' ? 'Live' : state === 'post' ? 'Result' : 'Scheduled'),
        dateIso: ev.date || '',
        home: mapSide(homeRaw),
        away: mapSide(awayRaw),
      });
    }
  }

  // Sort live matches first, then recent results, then upcoming
  const order = { in: 0, post: 1, pre: 2 };
  matches.sort((a, b) => order[a.state] - order[b.state]);

  return {
    fetchedAt: Date.now(),
    matches,
  };
}
