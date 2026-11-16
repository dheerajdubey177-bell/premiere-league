import { useEffect, useState } from 'react';
import { SportMode, StarPlayer } from '../data/premierLeagueTypes';
import { VERIFIED_CRICKET_PHOTOS } from '../data/verifiedCricketPhotos';
import { VERIFIED_PLAYER_PHOTOS } from '../data/verifiedPlayerPhotos';
import { VERIFIED_TENNIS_PHOTOS } from '../data/verifiedTennisPhotos';

export interface PlayerMediaResult {
  photoUrl: string | null;
  source: 'verified' | 'wikipedia' | 'thesportsdb' | 'none';
}

const mediaCache = new Map<string, PlayerMediaResult>();
const inFlightRequests = new Map<string, Promise<PlayerMediaResult>>();
const listeners = new Map<string, Set<(res: PlayerMediaResult) => void>>();
const brokenUrls = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getVerifiedPhotoUrl(star: StarPlayer): string | null {
  const key = `${star.clubId}:${star.name}`;
  const url =
    star.sport === 'cricket'
      ? (VERIFIED_CRICKET_PHOTOS[key] ?? null)
      : star.sport === 'tennis'
        ? (VERIFIED_TENNIS_PHOTOS[key] ?? null)
        : (VERIFIED_PLAYER_PHOTOS[key] ?? null);
  if (url && !brokenUrls.has(url)) return url;
  return null;
}

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
 * Batch-fetches Wikipedia thumbnails using the MediaWiki Query API (`titles=...` up to 40 per call)
 * with `pilicense=any` and `redirects=1` cleanly with rate-limit guards.
 */
async function fetchWikipediaBatch(stars: StarPlayer[]): Promise<Set<string>> {
  const resolvedIds = new Set<string>();
  if (stars.length === 0) return resolvedIds;

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

    const text = await res.text();
    if (!text.startsWith('{')) return resolvedIds;

    const data = JSON.parse(text);
    const query = data?.query;
    if (!query) return resolvedIds;

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

    const pageThumbByTitle = new Map<string, string>();
    const pages = query.pages ? Object.values(query.pages) : [];
    for (const p of pages as Array<Record<string, unknown>>) {
      const title = typeof p?.title === 'string' ? p.title : null;
      const thumb = (p?.thumbnail as { source?: string } | undefined)?.source;
      if (title && thumb && !brokenUrls.has(thumb)) {
        pageThumbByTitle.set(title, thumb);
      }
    }

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
    // Silent fallback handled by caller
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
    const url = data?.thumbnail?.source || data?.originalimage?.source || null;
    return url && !brokenUrls.has(url) ? url : null;
  } catch {
    return null;
  }
}

async function fetchFromTheSportsDB(
  playerName: string,
  sport: SportMode = 'football'
): Promise<string | null> {
  try {
    const cleanName = playerName.replace(/-/g, ' ');
    const targetSport =
      sport === 'cricket' ? 'Cricket' : sport === 'tennis' ? 'Tennis' : 'Soccer';
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=${encodeURIComponent(cleanName)}`
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.startsWith('{')) return null;

    const data = JSON.parse(text);
    const list = Array.isArray(data?.player) ? data.player : [];
    const match = list.find(
      (item: Record<string, unknown>) =>
        item &&
        item.strSport === targetSport &&
        (item.strCutout || item.strThumb || item.strRender)
    );
    if (!match) return null;
    const url =
      (match.strCutout as string) ||
      (match.strThumb as string) ||
      (match.strRender as string) ||
      null;
    return url && !brokenUrls.has(url) ? url : null;
  } catch {
    return null;
  }
}

export function getCachedPlayerMedia(star: StarPlayer): PlayerMediaResult | undefined {
  const cached = mediaCache.get(star.id);
  if (cached) return cached;

  const verifiedUrl = getVerifiedPhotoUrl(star);
  if (verifiedUrl) {
    const res: PlayerMediaResult = { photoUrl: verifiedUrl, source: 'verified' };
    mediaCache.set(star.id, res);
    return res;
  }
  return undefined;
}

export async function getPlayerMedia(star: StarPlayer): Promise<PlayerMediaResult> {
  const cached = getCachedPlayerMedia(star);
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

    const sportsDbPhoto = await fetchFromTheSportsDB(star.name, star.sport ?? 'football');
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
 * If a verified or cached URL ever fails to load in an <img> element, mark it broken and
 * fall back cleanly to live Wikipedia / TheSportsDB recovery once.
 */
export function recoverBrokenPhoto(star: StarPlayer, failedUrl: string): void {
  if (brokenUrls.has(failedUrl)) return;
  brokenUrls.add(failedUrl);
  mediaCache.delete(star.id);
  void getPlayerMedia(star);
}

/**
 * Prioritizes resolving media for any uncached players in a focused club's squad.
 */
export async function prioritizeClubMedia(clubStars: StarPlayer[]): Promise<void> {
  const missing = clubStars.filter((s) => !getCachedPlayerMedia(s));
  if (missing.length === 0) return;

  const resolvedIds = await fetchWikipediaBatch(missing);
  const stillMissing = missing.filter(
    (s) => !resolvedIds.has(s.id) && !getCachedPlayerMedia(s)
  );

  for (const star of stillMissing) {
    await getPlayerMedia(star);
    await sleep(300);
  }
}

/**
 * Populates the media cache instantaneously for all verified portraits across all 20 clubs,
 * and sequentially resolves any remaining players without triggering API rate limits.
 */
const prefetchedSports = new Set<string>();
export function prefetchAllPlayerMedia(allStars: StarPlayer[]): void {
  const sportKey = allStars[0]?.sport ?? 'football';
  if (prefetchedSports.has(sportKey)) return;
  prefetchedSports.add(sportKey);

  const missing: StarPlayer[] = [];
  for (const star of allStars) {
    if (!getCachedPlayerMedia(star)) {
      missing.push(star);
    }
  }

  if (missing.length === 0) return;

  void (async () => {
    const batchSize = 35;
    const unresolved: StarPlayer[] = [];

    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize).filter((s) => !getCachedPlayerMedia(s));
      if (batch.length === 0) continue;
      const resolvedIds = await fetchWikipediaBatch(batch);
      for (const s of batch) {
        if (!resolvedIds.has(s.id) && !getCachedPlayerMedia(s)) {
          unresolved.push(s);
        }
      }
      if (i + batchSize < missing.length) await sleep(200);
    }

    for (const star of unresolved) {
      if (!getCachedPlayerMedia(star)) {
        await getPlayerMedia(star);
        await sleep(800);
      }
    }
  })();
}

export function usePlayerMedia(star: StarPlayer | null): {
  media: PlayerMediaResult | null;
  loading: boolean;
} {
  const [media, setMedia] = useState<PlayerMediaResult | null>(() =>
    star ? (getCachedPlayerMedia(star) ?? null) : null
  );
  const [loading, setLoading] = useState<boolean>(() =>
    star ? !getCachedPlayerMedia(star) : false
  );

  useEffect(() => {
    if (!star) {
      setMedia(null);
      setLoading(false);
      return;
    }

    const cached = getCachedPlayerMedia(star);
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
