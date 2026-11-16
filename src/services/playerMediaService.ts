import { useEffect, useState } from 'react';
import { StarPlayer } from '../data/premierLeagueData';

export interface PlayerMediaResult {
  photoUrl: string | null;
  source: 'wikipedia' | 'thesportsdb' | 'none';
}

const mediaCache = new Map<string, PlayerMediaResult>();
const inFlightRequests = new Map<string, Promise<PlayerMediaResult>>();
const listeners = new Map<string, Set<(res: PlayerMediaResult) => void>>();

function notifyListeners(starId: string, result: PlayerMediaResult) {
  const subs = listeners.get(starId);
  if (!subs) return;
  subs.forEach((cb) => cb(result));
}

function setCachedAndNotify(starId: string, result: PlayerMediaResult) {
  mediaCache.set(starId, result);
  notifyListeners(starId, result);
}

/**
 * Batch-fetches Wikipedia thumbnails using the MediaWiki Query API (`titles=...` up to 35 per call)
 * with `pilicense=any` and `redirects=1` so all 360 players across all 20 clubs load in ~11 requests
 * without hitting HTTP 429 rate limits.
 */
async function fetchWikipediaBatch(stars: StarPlayer[]): Promise<Set<string>> {
  const resolvedIds = new Set<string>();
  if (stars.length === 0) return resolvedIds;

  // Map requested wiki title (underscore & space variants) -> StarPlayer[]
  const titleToStars = new Map<string, StarPlayer[]>();
  const titles: string[] = [];

  for (const star of stars) {
    const rawTitle = star.wikiTitle.trim();
    const spaced = rawTitle.replace(/_/g, ' ');
    if (!titleToStars.has(spaced)) {
      titleToStars.set(spaced, []);
      titles.push(rawTitle);
    }
    titleToStars.get(spaced)!.push(star);
  }

  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&titles=${encodeURIComponent(titles.join('|'))}` +
      `&prop=pageimages&piprop=thumbnail&pithumbsize=320&pilicense=any&redirects=1&format=json&origin=*`;

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return resolvedIds;

    const data = await res.json();
    const query = data?.query;
    if (!query) return resolvedIds;

    // Build alias resolution maps from normalized + redirects chains
    const normMap = new Map<string, string>();
    if (Array.isArray(query.normalized)) {
      for (const n of query.normalized) {
        if (n?.from && n?.to) normMap.set(n.from, n.to);
      }
    }

    const redirectMap = new Map<string, string>();
    if (Array.isArray(query.redirects)) {
      for (const r of query.redirects) {
        if (r?.from && r?.to) redirectMap.set(r.from, r.to);
      }
    }

    // Index returned pages by their canonical page title
    const pageThumbByTitle = new Map<string, string>();
    const pages = query.pages ? Object.values(query.pages) : [];
    for (const p of pages as Array<Record<string, unknown>>) {
      const title = typeof p?.title === 'string' ? p.title : null;
      const thumb = (p?.thumbnail as { source?: string } | undefined)?.source;
      if (title && thumb) {
        pageThumbByTitle.set(title, thumb);
      }
    }

    // Resolve every star in this batch
    for (const star of stars) {
      const raw = star.wikiTitle.trim();
      const spaced = raw.replace(/_/g, ' ');
      const step1 = normMap.get(raw) ?? normMap.get(spaced) ?? spaced;
      const step2 = redirectMap.get(step1) ?? step1;
      const finalTitle = redirectMap.get(step2) ?? step2;

      const photoUrl =
        pageThumbByTitle.get(finalTitle) ??
        pageThumbByTitle.get(step2) ??
        pageThumbByTitle.get(step1) ??
        null;

      if (photoUrl) {
        resolvedIds.add(star.id);
        setCachedAndNotify(star.id, { photoUrl, source: 'wikipedia' });
      }
    }
  } catch {
    // Silent network fallback handled by caller
  }

  return resolvedIds;
}

async function fetchFromWikipediaSummary(wikiTitle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.thumbnail?.source || data?.originalimage?.source || null;
  } catch {
    return null;
  }
}

async function fetchFromTheSportsDB(playerName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data?.player) ? data.player : [];
    const soccerMatch = list.find(
      (item: Record<string, unknown>) =>
        item &&
        item.strSport === 'Soccer' &&
        (item.strCutout || item.strThumb || item.strRender)
    );
    if (!soccerMatch) return null;
    return (
      (soccerMatch.strCutout as string) ||
      (soccerMatch.strThumb as string) ||
      (soccerMatch.strRender as string) ||
      null
    );
  } catch {
    return null;
  }
}

export function getCachedPlayerMedia(starId: string): PlayerMediaResult | undefined {
  return mediaCache.get(starId);
}

export async function getPlayerMedia(star: StarPlayer): Promise<PlayerMediaResult> {
  const cached = mediaCache.get(star.id);
  if (cached) return cached;

  const existing = inFlightRequests.get(star.id);
  if (existing) return existing;

  const promise = (async (): Promise<PlayerMediaResult> => {
    const resolved = await fetchWikipediaBatch([star]);
    if (resolved.has(star.id)) {
      return mediaCache.get(star.id)!;
    }

    const restThumb = await fetchFromWikipediaSummary(star.wikiTitle);
    if (restThumb) {
      const result: PlayerMediaResult = { photoUrl: restThumb, source: 'wikipedia' };
      setCachedAndNotify(star.id, result);
      return result;
    }

    const sportsDbPhoto = await fetchFromTheSportsDB(star.name);
    if (sportsDbPhoto) {
      const result: PlayerMediaResult = { photoUrl: sportsDbPhoto, source: 'thesportsdb' };
      setCachedAndNotify(star.id, result);
      return result;
    }

    const empty: PlayerMediaResult = { photoUrl: null, source: 'none' };
    setCachedAndNotify(star.id, empty);
    return empty;
  })().finally(() => {
    inFlightRequests.delete(star.id);
  });

  inFlightRequests.set(star.id, promise);
  return promise;
}

/**
 * Prioritizes resolving media for a specific focused club's full 18-man squad immediately.
 */
export async function prioritizeClubMedia(clubStars: StarPlayer[]): Promise<void> {
  const missing = clubStars.filter((s) => !mediaCache.has(s.id));
  if (missing.length === 0) return;

  const resolvedIds = await fetchWikipediaBatch(missing);
  const stillMissing = missing.filter((s) => !resolvedIds.has(s.id) && !mediaCache.has(s.id));

  for (const star of stillMissing) {
    void getPlayerMedia(star);
  }
}

/**
 * Batch-prefetches all 360 player photos across all 20 clubs cleanly in ~11 Wikipedia API calls,
 * loading marquee stars across all clubs first so every team displays portraits on the globe immediately,
 * followed by full squads and TheSportsDB fallbacks for any remaining players.
 */
let prefetchStarted = false;
export function prefetchAllPlayerMedia(allStars: StarPlayer[]): void {
  if (prefetchStarted) return;
  prefetchStarted = true;

  const marqueeStars = allStars.filter((s) => s.marquee);
  const squadStars = allStars.filter((s) => !s.marquee);
  const ordered = [...marqueeStars, ...squadStars];

  const batchSize = 35;
  const batches: StarPlayer[][] = [];
  for (let i = 0; i < ordered.length; i += batchSize) {
    batches.push(ordered.slice(i, i + batchSize));
  }

  void (async () => {
    const unresolved: StarPlayer[] = [];

    // Run batches with gentle concurrency of 2 so all 20 clubs populate swiftly without 429s
    let cursor = 0;
    const batchWorker = async () => {
      while (cursor < batches.length) {
        const idx = cursor++;
        const batch = batches[idx].filter((s) => !mediaCache.has(s.id));
        if (batch.length === 0) continue;

        const resolvedIds = await fetchWikipediaBatch(batch);
        for (const s of batch) {
          if (!resolvedIds.has(s.id) && !mediaCache.has(s.id)) {
            unresolved.push(s);
          }
        }
      }
    };

    await Promise.all([batchWorker(), batchWorker()]);

    // Fallback pass via TheSportsDB / REST summary for any player missed by batch pageimages
    let fbCursor = 0;
    const fallbackWorker = async () => {
      while (fbCursor < unresolved.length) {
        const idx = fbCursor++;
        const star = unresolved[idx];
        if (!mediaCache.has(star.id)) {
          await getPlayerMedia(star);
        }
      }
    };

    await Promise.all([fallbackWorker(), fallbackWorker(), fallbackWorker()]);
  })();
}

export function usePlayerMedia(star: StarPlayer | null): {
  media: PlayerMediaResult | null;
  loading: boolean;
} {
  const [media, setMedia] = useState<PlayerMediaResult | null>(() =>
    star ? (mediaCache.get(star.id) ?? null) : null
  );
  const [loading, setLoading] = useState<boolean>(() =>
    star ? !mediaCache.has(star.id) : false
  );

  useEffect(() => {
    if (!star) {
      setMedia(null);
      setLoading(false);
      return;
    }

    const cached = mediaCache.get(star.id);
    if (cached) {
      setMedia(cached);
      setLoading(false);
      return;
    }

    setMedia(null);
    setLoading(true);

    let active = true;
    const sub = (res: PlayerMediaResult) => {
      if (!active) return;
      setMedia(res);
      setLoading(false);
    };

    if (!listeners.has(star.id)) {
      listeners.set(star.id, new Set());
    }
    listeners.get(star.id)!.add(sub);

    // Trigger load if not already queued
    void getPlayerMedia(star).then((res) => {
      if (!active) return;
      setMedia(res);
      setLoading(false);
    });

    return () => {
      active = false;
      listeners.get(star.id)?.delete(sub);
    };
  }, [star]);

  return { media, loading };
}
