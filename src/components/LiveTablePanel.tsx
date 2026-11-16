import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trophy, X } from 'lucide-react';
import {
  fetchLivePremierLeagueMatches,
  fetchLivePremierLeagueTable,
  LiveLeagueTableData,
  LiveMatchItem,
  LiveMatchweekData,
  TableZone,
} from '../services/premierLeagueTableService';

export interface LiveTablePanelProps {
  open: boolean;
  selectedClubId: string | null;
  onClose: () => void;
  onSelectGlobeClub: (clubId: string) => void;
}

type ActiveTab = 'standings' | 'matches';

const ClubCrest: React.FC<{ logoUrl: string | null; abbreviation: string; name: string }> = ({
  logoUrl,
  abbreviation,
  name,
}) => {
  const [failed, setFailed] = useState(false);

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
  open,
  selectedClubId,
  onClose,
  onSelectGlobeClub,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('standings');
  const [tableData, setTableData] = useState<LiveLeagueTableData | null>(null);
  const [matchesData, setMatchesData] = useState<LiveMatchweekData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
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
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadData(controller.signal);

    const intervalId = window.setInterval(() => {
      void loadData();
    }, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [open, loadData]);

  if (!open) return null;

  const seasonHeading =
    tableData?.seasonLabel || matchesData?.seasonLabel || 'English Premier League';
  const lastFetchedAt = tableData?.fetchedAt ?? matchesData?.fetchedAt ?? null;

  return (
    <aside
      role="dialog"
      aria-label="Live Premier League Table"
      className="fixed top-3 right-3 bottom-3 left-3 sm:left-auto sm:top-4 sm:right-4 sm:bottom-4 sm:w-[min(560px,92vw)] z-30 flex flex-col rounded-2xl border border-white/15 bg-[#0a101b]/97 shadow-[0_28px_70px_rgba(0,0,0,0.85)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
            <h2 className="font-display text-xl font-bold tracking-wide text-slate-50 truncate">
              {seasonHeading}
            </h2>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
            <span>Live Standings</span>
            {lastFetchedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  Updated {formatUpdatedClock(lastFetchedAt)}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>Click a club to locate on globe</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            title="Refresh live table"
            aria-label="Refresh live table"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close live league table"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Segmented View Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 sm:px-5">
        <div className="inline-flex items-center gap-1 rounded-lg bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('standings')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'standings'
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Standings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matches')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'matches'
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Matchweek
          </button>
        </div>

        <span className="font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
          {activeTab === 'standings'
            ? `${tableData?.rows.length ?? 20} Clubs`
            : `${matchesData?.matches.length ?? 0} Fixtures`}
        </span>
      </div>

      {/* Body Content */}
      <div className="club-scroll flex-1 overflow-y-auto px-3 py-2 sm:px-4">
        {loading && !tableData && (
          <div className="space-y-2 py-3">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div
                key={idx}
                className="h-9 w-full rounded-md bg-white/5 animate-pulse"
              />
            ))}
          </div>
        )}

        {error && !tableData && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
            <p className="text-sm text-rose-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
            >
              Retry Live Feed
            </button>
          </div>
        )}

        {activeTab === 'standings' && tableData && (
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

        {activeTab === 'matches' && (
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
      </div>

      {/* Footer Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5 text-[11px] text-slate-400 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-emerald-400">Champions League</span>
          <span aria-hidden="true">·</span>
          <span className="text-sky-400">Europa League</span>
          <span aria-hidden="true">·</span>
          <span className="text-rose-400">Relegation</span>
        </div>
        <span className="font-mono-tabular text-slate-500">Auto-sync 60s</span>
      </div>
    </aside>
  );
};
