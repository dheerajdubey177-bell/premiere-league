import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trophy, X } from 'lucide-react';
import { SportMode } from '../data/premierLeagueTypes';
import {
  CricketFormat,
  CricketLiveMatchesBundle,
  CricketRankingsBundle,
  fetchLiveCricketMatches,
  fetchLiveIccRankings,
} from '../services/cricketTableService';
import {
  fetchLivePremierLeagueMatches,
  fetchLivePremierLeagueTable,
  LiveLeagueTableData,
  LiveMatchItem,
  LiveMatchweekData,
  TableZone,
} from '../services/premierLeagueTableService';

import {
  fetchLiveTennisMatches,
  fetchLiveTennisRankings,
  TennisLiveMatchesBundle,
  TennisRankingsBundle,
  TennisTour,
} from '../services/tennisTableService';

export interface LiveTablePanelProps {
  sport: SportMode;
  open: boolean;
  selectedClubId: string | null;
  onClose: () => void;
  onSelectGlobeClub: (clubId: string) => void;
}

type FootballTab = 'standings' | 'matches';
type CricketTab = 'rankings' | 'scores';
type TennisTab = 'rankings' | 'scores';

const ClubCrest: React.FC<{ logoUrl: string | null; abbreviation: string; name: string }> = ({
  logoUrl,
  abbreviation,
  name,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!logoUrl || failed) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-white/15 bg-white/8 font-mono-tabular text-[9px] font-semibold text-slate-300">
        {abbreviation.slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={`${name} crest`}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-5 w-5 shrink-0 object-contain"
    />
  );
};

function zoneRankTextClass(zone: TableZone): string {
  if (zone === 'ucl') return 'text-emerald-400';
  if (zone === 'uel') return 'text-sky-400';
  if (zone === 'relegation') return 'text-rose-400';
  return 'text-slate-400';
}

function formatMatchDateTime(iso: string): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatUpdatedClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const LiveTablePanel: React.FC<LiveTablePanelProps> = ({
  sport,
  open,
  selectedClubId,
  onClose,
  onSelectGlobeClub,
}) => {
  // Football state
  const [footballTab, setFootballTab] = useState<FootballTab>('standings');
  const [tableData, setTableData] = useState<LiveLeagueTableData | null>(null);
  const [matchesData, setMatchesData] = useState<LiveMatchweekData | null>(null);

  // Cricket state
  const [cricketTab, setCricketTab] = useState<CricketTab>('rankings');
  const [cricketFormat, setCricketFormat] = useState<CricketFormat>('test');
  const [cricketRankings, setCricketRankings] = useState<
    Partial<Record<CricketFormat, CricketRankingsBundle>>
  >({});
  const [cricketMatches, setCricketMatches] = useState<CricketLiveMatchesBundle | null>(null);

  // Tennis state
  const [tennisTab, setTennisTab] = useState<TennisTab>('rankings');
  const [tennisTour, setTennisTour] = useState<TennisTour>('atp');
  const [tennisRankings, setTennisRankings] = useState<
    Partial<Record<TennisTour, TennisRankingsBundle>>
  >({});
  const [tennisMatches, setTennisMatches] = useState<TennisLiveMatchesBundle | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFootballData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [standingsRes, matchesRes] = await Promise.allSettled([
        fetchLivePremierLeagueTable(signal),
        fetchLivePremierLeagueMatches(signal),
      ]);

      if (signal?.aborted) return;

      if (standingsRes.status === 'fulfilled') {
        setTableData(standingsRes.value);
      } else {
        throw standingsRes.reason;
      }

      if (matchesRes.status === 'fulfilled') {
        setMatchesData(matchesRes.value);
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Unable to load live Premier League table');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const loadCricketData = useCallback(
    async (format: CricketFormat, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [rankingsRes, scoresRes] = await Promise.allSettled([
          fetchLiveIccRankings(format, signal),
          fetchLiveCricketMatches(signal),
        ]);

        if (signal?.aborted) return;

        if (rankingsRes.status === 'fulfilled') {
          setCricketRankings((prev) => ({
            ...prev,
            [format]: rankingsRes.value,
          }));
        }
        if (scoresRes.status === 'fulfilled') {
          setCricketMatches(scoresRes.value);
        }

        if (rankingsRes.status === 'rejected' && scoresRes.status === 'rejected') {
          throw rankingsRes.reason;
        }
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Unable to load live Cricket data');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    []
  );

  const loadTennisData = useCallback(async (tour: TennisTour, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [rankingsRes, scoresRes] = await Promise.allSettled([
        fetchLiveTennisRankings(tour, signal),
        fetchLiveTennisMatches(signal),
      ]);

      if (signal?.aborted) return;

      if (rankingsRes.status === 'fulfilled') {
        setTennisRankings((prev) => ({
          ...prev,
          [tour]: rankingsRes.value,
        }));
      }
      if (scoresRes.status === 'fulfilled') {
        setTennisMatches(scoresRes.value);
      }

      if (rankingsRes.status === 'rejected' && scoresRes.status === 'rejected') {
        throw rankingsRes.reason;
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Unable to load live Tennis data');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    if (sport === 'football') {
      void loadFootballData(controller.signal);
    } else if (sport === 'cricket') {
      void loadCricketData(cricketFormat, controller.signal);
    } else {
      void loadTennisData(tennisTour, controller.signal);
    }

    const intervalId = window.setInterval(() => {
      if (sport === 'football') {
        void loadFootballData();
      } else if (sport === 'cricket') {
        void loadCricketData(cricketFormat);
      } else {
        void loadTennisData(tennisTour);
      }
    }, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [open, sport, cricketFormat, tennisTour, loadFootballData, loadCricketData, loadTennisData]);

  if (!open) return null;

  const currentCricketRanking = cricketRankings[cricketFormat] ?? null;
  const currentTennisRanking = tennisRankings[tennisTour] ?? null;

  const headingTitle =
    sport === 'cricket'
      ? cricketTab === 'rankings'
        ? currentCricketRanking?.title || "ICC Men's Team Rankings"
        : 'Live World Cricket Scores'
      : sport === 'tennis'
        ? tennisTab === 'rankings'
          ? currentTennisRanking?.title || `${tennisTour.toUpperCase()} Singles Rankings`
          : 'Live ATP & WTA Tour Scores'
        : tableData?.seasonLabel || matchesData?.seasonLabel || 'English Premier League';

  const lastFetchedAt =
    sport === 'cricket'
      ? currentCricketRanking?.fetchedAt ?? cricketMatches?.fetchedAt ?? null
      : sport === 'tennis'
        ? currentTennisRanking?.fetchedAt ?? tennisMatches?.fetchedAt ?? null
        : tableData?.fetchedAt ?? matchesData?.fetchedAt ?? null;

  const handleRefresh = () => {
    if (sport === 'football') {
      void loadFootballData();
    } else if (sport === 'cricket') {
      void loadCricketData(cricketFormat);
    } else {
      void loadTennisData(tennisTour);
    }
  };

  return (
    <aside
      role="dialog"
      aria-label={
        sport === 'cricket'
          ? 'Live Cricket Rankings & Scores'
          : sport === 'tennis'
            ? 'Live Tennis Rankings & Scores'
            : 'Live Premier League Table'
      }
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 sm:left-auto sm:top-4 sm:right-4 sm:bottom-4 sm:w-[min(560px,92vw)] z-30 flex flex-col rounded-2xl border border-white/15 bg-[#0a101b]/97 shadow-[0_28px_70px_rgba(0,0,0,0.85)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
            <h2 className="font-display text-xl font-bold tracking-wide text-slate-50 truncate">
              {headingTitle}
            </h2>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
            <span>
              {sport === 'cricket'
                ? 'ICC Live Feed'
                : sport === 'tennis'
                  ? 'ATP & WTA Live Feed'
                  : 'Live Standings'}
            </span>
            {lastFetchedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  Updated {formatUpdatedClock(lastFetchedAt)}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {sport === 'football'
                ? 'Click a club to locate on globe'
                : 'Click a nation to locate on globe'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh live feed"
            aria-label="Refresh live feed"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close live table"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Segmented View Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 sm:px-5">
        {sport === 'football' ? (
          <>
            <div className="inline-flex items-center gap-1 rounded-lg bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setFootballTab('standings')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  footballTab === 'standings'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Standings
              </button>
              <button
                type="button"
                onClick={() => setFootballTab('matches')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  footballTab === 'matches'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Matchweek
              </button>
            </div>
            <span className="font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
              {footballTab === 'standings'
                ? `${tableData?.rows.length ?? 20} Clubs`
                : `${matchesData?.matches.length ?? 0} Fixtures`}
            </span>
          </>
        ) : sport === 'cricket' ? (
          <>
            <div className="inline-flex items-center gap-1 rounded-lg bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setCricketTab('rankings')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cricketTab === 'rankings'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                ICC Rankings
              </button>
              <button
                type="button"
                onClick={() => setCricketTab('scores')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cricketTab === 'scores'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Live Scores
              </button>
            </div>

            {cricketTab === 'rankings' ? (
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-white/5 p-1">
                {(['test', 'odi', 't20i'] as CricketFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setCricketFormat(fmt)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cricketFormat === fmt
                        ? 'bg-slate-100 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {fmt === 't20i' ? 'T20I' : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            ) : (
              <span className="font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                {cricketMatches?.matches.length ?? 0} Matches
              </span>
            )}
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-1 rounded-lg bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setTennisTab('rankings')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tennisTab === 'rankings'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Tour Rankings
              </button>
              <button
                type="button"
                onClick={() => setTennisTab('scores')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tennisTab === 'scores'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Live Scores
              </button>
            </div>

            {tennisTab === 'rankings' ? (
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-white/5 p-1">
                {(['atp', 'wta'] as TennisTour[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTennisTour(t)}
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold uppercase transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      tennisTour === t
                        ? 'bg-slate-100 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            ) : (
              <span className="font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
                {tennisMatches?.matches.length ?? 0} Matches
              </span>
            )}
          </>
        )}
      </div>

      {/* Body Content */}
      <div className="club-scroll overscroll-contain flex-1 overflow-y-auto px-3 py-2 sm:px-4">
        {loading &&
          ((sport === 'football' && !tableData) ||
            (sport === 'cricket' && !currentCricketRanking && !cricketMatches) ||
            (sport === 'tennis' && !currentTennisRanking && !tennisMatches)) && (
            <div className="space-y-2 py-3">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div key={idx} className="h-9 w-full rounded-md bg-white/5 animate-pulse" />
              ))}
            </div>
          )}

        {error &&
          ((sport === 'football' && !tableData) ||
            (sport === 'cricket' && !currentCricketRanking && !cricketMatches) ||
            (sport === 'tennis' && !currentTennisRanking && !tennisMatches)) && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
              <p className="text-sm text-rose-300">{error}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
              >
                Retry Live Feed
              </button>
            </div>
          )}

        {/* FOOTBALL STANDINGS */}
        {sport === 'football' && footballTab === 'standings' && tableData && (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#0a101b] text-[11px] font-medium text-slate-400 border-b border-white/10">
              <tr>
                <th className="py-2 pl-2 pr-1.5 w-8 text-right font-mono-tabular">#</th>
                <th className="py-2 px-2">Club</th>
                <th className="py-2 px-1.5 text-right font-mono-tabular">MP</th>
                <th className="py-2 px-1.5 text-right font-mono-tabular">W</th>
                <th className="py-2 px-1.5 text-right font-mono-tabular">D</th>
                <th className="py-2 px-1.5 text-right font-mono-tabular">L</th>
                <th className="hidden sm:table-cell py-2 px-1.5 text-right font-mono-tabular">GF</th>
                <th className="hidden sm:table-cell py-2 px-1.5 text-right font-mono-tabular">GA</th>
                <th className="py-2 px-1.5 text-right font-mono-tabular">GD</th>
                <th className="py-2 pl-1.5 pr-2 text-right font-mono-tabular text-slate-200">
                  PTS
                </th>
              </tr>
            </thead>
            <tbody>
              {tableData.rows.map((row) => {
                const isSelectedOnGlobe =
                  selectedClubId !== null && row.globeClubId === selectedClubId;
                const canLocate = row.globeClubId !== null;
                const gdFormatted =
                  row.goalDifference > 0
                    ? `+${row.goalDifference}`
                    : `${row.goalDifference}`;

                return (
                  <tr
                    key={row.espnId}
                    onClick={() => {
                      if (row.globeClubId) {
                        onSelectGlobeClub(row.globeClubId);
                      }
                    }}
                    title={
                      canLocate
                        ? `Focus ${row.clubName} on 3D Globe`
                        : `${row.clubName} (not in current 3D squad sectors)`
                    }
                    className={`border-b border-white/6 transition-colors ${
                      isSelectedOnGlobe
                        ? 'bg-amber-400/14 text-white'
                        : canLocate
                        ? 'hover:bg-white/6 cursor-pointer text-slate-200'
                        : 'text-slate-400'
                    }`}
                  >
                    <td
                      className={`py-2.5 pl-2 pr-1.5 text-right font-mono-tabular font-semibold ${zoneRankTextClass(
                        row.zone
                      )}`}
                    >
                      {row.rank}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ClubCrest
                          logoUrl={row.logoUrl}
                          abbreviation={row.abbreviation}
                          name={row.clubName}
                        />
                        <span
                          className={`truncate font-medium ${
                            isSelectedOnGlobe ? 'text-amber-200' : ''
                          }`}
                        >
                          {row.shortName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-1.5 text-right font-mono-tabular text-slate-300">
                      {row.played}
                    </td>
                    <td className="py-2.5 px-1.5 text-right font-mono-tabular text-slate-300">
                      {row.wins}
                    </td>
                    <td className="py-2.5 px-1.5 text-right font-mono-tabular text-slate-400">
                      {row.draws}
                    </td>
                    <td className="py-2.5 px-1.5 text-right font-mono-tabular text-slate-400">
                      {row.losses}
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-1.5 text-right font-mono-tabular text-slate-400">
                      {row.goalsFor}
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-1.5 text-right font-mono-tabular text-slate-400">
                      {row.goalsAgainst}
                    </td>
                    <td
                      className={`py-2.5 px-1.5 text-right font-mono-tabular ${
                        row.goalDifference > 0
                          ? 'text-emerald-300'
                          : row.goalDifference < 0
                          ? 'text-rose-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {gdFormatted}
                    </td>
                    <td className="py-2.5 pl-1.5 pr-2 text-right font-mono-tabular font-bold text-white">
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* FOOTBALL MATCHWEEK */}
        {sport === 'football' && footballTab === 'matches' && (
          <div className="space-y-2 py-2">
            {!matchesData || matchesData.matches.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                No matchweek fixtures currently scheduled.
              </p>
            ) : (
              matchesData.matches.map((match: LiveMatchItem) => (
                <div
                  key={match.id}
                  className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span
                      className={
                        match.state === 'in'
                          ? 'font-semibold text-emerald-400'
                          : match.state === 'post'
                          ? 'text-slate-300'
                          : 'text-slate-400'
                      }
                    >
                      {match.state === 'in'
                        ? `LIVE · ${match.statusShort || match.statusDetail}`
                        : match.state === 'post'
                        ? match.statusShort || 'FT'
                        : formatMatchDateTime(match.dateIso)}
                    </span>
                    {match.venue && <span className="truncate">{match.venue}</span>}
                  </div>

                  <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={!match.home.globeClubId}
                      onClick={() => {
                        if (match.home.globeClubId) {
                          onSelectGlobeClub(match.home.globeClubId);
                        }
                      }}
                      className={`flex items-center justify-end gap-2 min-w-0 text-right ${
                        match.home.globeClubId
                          ? 'hover:text-amber-300 transition-colors cursor-pointer'
                          : 'cursor-default text-slate-400'
                      }`}
                    >
                      <span
                        className={`truncate font-medium ${
                          match.home.winner ? 'text-white font-semibold' : 'text-slate-200'
                        }`}
                      >
                        {match.home.shortName}
                      </span>
                      <ClubCrest
                        logoUrl={match.home.logoUrl}
                        abbreviation={match.home.abbreviation}
                        name={match.home.name}
                      />
                    </button>

                    <div className="px-2 text-center font-mono-tabular text-sm font-bold text-white">
                      {match.state === 'pre' ? (
                        <span className="text-xs font-normal text-slate-500">vs</span>
                      ) : (
                        <span>
                          {match.home.score} - {match.away.score}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!match.away.globeClubId}
                      onClick={() => {
                        if (match.away.globeClubId) {
                          onSelectGlobeClub(match.away.globeClubId);
                        }
                      }}
                      className={`flex items-center justify-start gap-2 min-w-0 text-left ${
                        match.away.globeClubId
                          ? 'hover:text-amber-300 transition-colors cursor-pointer'
                          : 'cursor-default text-slate-400'
                      }`}
                    >
                      <ClubCrest
                        logoUrl={match.away.logoUrl}
                        abbreviation={match.away.abbreviation}
                        name={match.away.name}
                      />
                      <span
                        className={`truncate font-medium ${
                          match.away.winner ? 'text-white font-semibold' : 'text-slate-200'
                        }`}
                      >
                        {match.away.shortName}
                      </span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* CRICKET ICC RANKINGS */}
        {sport === 'cricket' && cricketTab === 'rankings' && currentCricketRanking && (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#0a101b] text-[11px] font-medium text-slate-400 border-b border-white/10">
              <tr>
                <th className="py-2 pl-2 pr-1.5 w-8 text-right font-mono-tabular">#</th>
                <th className="py-2 px-2">Nation</th>
                <th className="py-2 px-2 text-right font-mono-tabular">Matches</th>
                <th className="py-2 px-2 text-right font-mono-tabular">Points</th>
                <th className="py-2 pl-2 pr-2 text-right font-mono-tabular text-slate-200">
                  Rating
                </th>
              </tr>
            </thead>
            <tbody>
              {currentCricketRanking.rows.map((row) => {
                const isSelectedOnGlobe =
                  selectedClubId !== null && row.globeClubId === selectedClubId;
                const canLocate = row.globeClubId !== null;
                const rankClass =
                  row.rank === 1
                    ? 'text-amber-300'
                    : row.rank <= 4
                    ? 'text-emerald-400'
                    : 'text-slate-400';

                return (
                  <tr
                    key={`${currentCricketRanking.format}-${row.rank}-${row.teamName}`}
                    onClick={() => {
                      if (row.globeClubId) {
                        onSelectGlobeClub(row.globeClubId);
                      }
                    }}
                    title={
                      canLocate
                        ? `Focus ${row.teamName} on 3D Cricket Globe`
                        : `${row.teamName} (ICC Ranked)`
                    }
                    className={`border-b border-white/6 transition-colors ${
                      isSelectedOnGlobe
                        ? 'bg-amber-400/14 text-white'
                        : canLocate
                        ? 'hover:bg-white/6 cursor-pointer text-slate-200'
                        : 'text-slate-400'
                    }`}
                  >
                    <td className={`py-2.5 pl-2 pr-1.5 text-right font-mono-tabular font-semibold ${rankClass}`}>
                      {row.rank}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ClubCrest
                          logoUrl={row.flagUrl}
                          abbreviation={row.teamName.slice(0, 3).toUpperCase()}
                          name={row.teamName}
                        />
                        <span
                          className={`truncate font-medium ${
                            isSelectedOnGlobe ? 'text-amber-200' : ''
                          }`}
                        >
                          {row.teamName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-tabular text-slate-300">
                      {row.matches}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-tabular text-slate-400">
                      {row.points.toLocaleString()}
                    </td>
                    <td className="py-2.5 pl-2 pr-2 text-right font-mono-tabular font-bold text-white">
                      {row.rating}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* CRICKET LIVE SCORES */}
        {sport === 'cricket' && cricketTab === 'scores' && (
          <div className="space-y-2 py-2">
            {!cricketMatches || cricketMatches.matches.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                No active international or domestic cricket matches right now.
              </p>
            ) : (
              cricketMatches.matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate font-medium text-slate-300">
                      {match.seriesName}
                    </span>
                    <span
                      className={`shrink-0 font-mono-tabular ${
                        match.state === 'in'
                          ? 'font-semibold text-emerald-400'
                          : match.state === 'post'
                          ? 'text-slate-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {match.state === 'in'
                        ? `LIVE · ${match.statusText}`
                        : match.state === 'post'
                        ? match.statusText
                        : formatMatchDateTime(match.dateIso)}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5 text-xs">
                    {[match.home, match.away].map((side, idx) => (
                      <div
                        key={`${match.id}-${idx}-${side.name}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          disabled={!side.globeClubId}
                          onClick={() => {
                            if (side.globeClubId) {
                              onSelectGlobeClub(side.globeClubId);
                            }
                          }}
                          className={`flex items-center gap-2 min-w-0 text-left ${
                            side.globeClubId
                              ? 'hover:text-amber-300 transition-colors cursor-pointer'
                              : 'cursor-default text-slate-300'
                          }`}
                        >
                          <ClubCrest
                            logoUrl={side.logoUrl}
                            abbreviation={side.abbreviation}
                            name={side.name}
                          />
                          <span
                            className={`truncate font-medium ${
                              side.winner ? 'text-white font-semibold' : 'text-slate-200'
                            }`}
                          >
                            {side.name}
                          </span>
                        </button>

                        <span className="font-mono-tabular text-xs font-semibold text-slate-100 shrink-0">
                          {side.score || (match.state === 'pre' ? 'Upcoming' : '—')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {match.matchNote && (
                    <p className="mt-1.5 text-[11px] text-amber-200/85 truncate">
                      {match.matchNote}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TENNIS ATP / WTA RANKINGS */}
        {sport === 'tennis' && tennisTab === 'rankings' && currentTennisRanking && (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#0a101b] text-[11px] font-medium text-slate-400 border-b border-white/10">
              <tr>
                <th className="py-2 pl-2 pr-1.5 w-8 text-right font-mono-tabular">#</th>
                <th className="py-2 px-2">Player</th>
                <th className="hidden sm:table-cell py-2 px-2">Nation</th>
                <th className="py-2 pl-2 pr-2 text-right font-mono-tabular text-slate-200">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {currentTennisRanking.rows.map((row) => {
                const isSelectedOnGlobe =
                  selectedClubId !== null && row.globeClubId === selectedClubId;
                const canLocate = row.globeClubId !== null;
                const rankClass =
                  row.rank === 1
                    ? 'text-amber-300'
                    : row.rank <= 8
                      ? 'text-emerald-400'
                      : 'text-slate-400';

                return (
                  <tr
                    key={`${currentTennisRanking.tour}-${row.rank}-${row.playerName}`}
                    onClick={() => {
                      if (row.globeClubId) {
                        onSelectGlobeClub(row.globeClubId);
                      }
                    }}
                    title={
                      canLocate
                        ? `Focus ${row.countryName || row.playerName} on 3D Tennis Globe`
                        : `${row.playerName} (${row.countryName || 'Tour'})`
                    }
                    className={`border-b border-white/6 transition-colors ${
                      isSelectedOnGlobe
                        ? 'bg-amber-400/14 text-white'
                        : canLocate
                          ? 'hover:bg-white/6 cursor-pointer text-slate-200'
                          : 'text-slate-400'
                    }`}
                  >
                    <td className={`py-2.5 pl-2 pr-1.5 text-right font-mono-tabular font-semibold ${rankClass}`}>
                      {row.rank}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ClubCrest
                          logoUrl={row.flagUrl}
                          abbreviation={(row.countryName || row.playerName).slice(0, 3).toUpperCase()}
                          name={row.countryName || row.playerName}
                        />
                        <span
                          className={`truncate font-medium ${
                            isSelectedOnGlobe ? 'text-amber-200' : ''
                          }`}
                        >
                          {row.playerName}
                        </span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-2 text-slate-400 truncate max-w-[130px]">
                      {row.countryName || '—'}
                    </td>
                    <td className="py-2.5 pl-2 pr-2 text-right font-mono-tabular font-bold text-white">
                      {row.points.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* TENNIS LIVE SCORES */}
        {sport === 'tennis' && tennisTab === 'scores' && (
          <div className="space-y-2 py-2">
            {!tennisMatches || tennisMatches.matches.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                No active ATP or WTA tour matches right now.
              </p>
            ) : (
              tennisMatches.matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate font-medium text-slate-300">
                      {match.tourLabel} · {match.tournamentName}
                      {match.competitionType ? ` (${match.competitionType})` : ''}
                    </span>
                    <span
                      className={`shrink-0 font-mono-tabular ${
                        match.state === 'in'
                          ? 'font-semibold text-emerald-400'
                          : match.state === 'post'
                            ? 'text-slate-300'
                            : 'text-slate-400'
                      }`}
                    >
                      {match.state === 'in'
                        ? `LIVE · ${match.statusText}`
                        : match.state === 'post'
                          ? match.statusText
                          : formatMatchDateTime(match.dateIso)}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5 text-xs">
                    {[match.home, match.away].map((side, idx) => (
                      <div
                        key={`${match.id}-${idx}-${side.name}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {side.seed && (
                            <span className="font-mono-tabular text-[10px] text-amber-300/90 shrink-0">
                              [{side.seed}]
                            </span>
                          )}
                          <span
                            className={`truncate font-medium ${
                              side.winner ? 'text-white font-semibold' : 'text-slate-200'
                            }`}
                          >
                            {side.name}
                          </span>
                        </div>

                        <span className="font-mono-tabular text-xs font-semibold text-slate-100 shrink-0">
                          {side.score || (match.state === 'pre' ? 'Scheduled' : '—')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {(match.matchNote || match.location) && (
                    <p className="mt-1.5 text-[11px] text-slate-400 truncate">
                      {[match.matchNote, match.location].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5 text-[11px] text-slate-400 sm:px-5">
        {sport === 'football' ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-emerald-400">Champions League</span>
            <span aria-hidden="true">·</span>
            <span className="text-sky-400">Europa League</span>
            <span aria-hidden="true">·</span>
            <span className="text-rose-400">Relegation</span>
          </div>
        ) : sport === 'cricket' ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-amber-300">No. 1 Ranked</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">Top 4 Nations</span>
            <span aria-hidden="true">·</span>
            <span>Test · ODI · T20I</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-amber-300">World No. 1</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">Top 8 Seeded</span>
            <span aria-hidden="true">·</span>
            <span>ATP · WTA Top 50</span>
          </div>
        )}
        <span className="font-mono-tabular text-slate-500">Auto-sync 60s</span>
      </div>
    </aside>
  );
};
