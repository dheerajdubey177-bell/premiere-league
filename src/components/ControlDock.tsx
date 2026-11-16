import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { ClubSector, PlayerPosition, StarPlayer } from '../data/premierLeagueData';
import { SportMode } from '../data/premierLeagueTypes';
import { PlayerAvatar } from './PlayerAvatar';

export interface ControlDockProps {
  sport: SportMode;
  clubs: ClubSector[];
  allStars: StarPlayer[];
  selectedClubId: string | null;
  selectedStarId: string | null;
  positionFilter: PlayerPosition | 'ALL';
  explodeTarget: number;
  autoRotate: boolean;
  showLabels: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectClub: (clubId: string | null) => void;
  onSelectStar: (starId: string | null) => void;
  onChangePositionFilter: (pos: PlayerPosition | 'ALL') => void;
  onChangeExplode: (val: number) => void;
  onToggleAutoRotate: () => void;
  onToggleLabels: () => void;
  onResetView: () => void;
}

const FOOTBALL_POSITION_OPTIONS: Array<{ value: PlayerPosition | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'FW', label: 'FW' },
  { value: 'MF', label: 'MF' },
  { value: 'DF', label: 'DF' },
  { value: 'GK', label: 'GK' },
];

const CRICKET_POSITION_OPTIONS: Array<{ value: PlayerPosition | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'BAT', label: 'BAT' },
  { value: 'AR', label: 'AR' },
  { value: 'BWL', label: 'BWL' },
  { value: 'WK', label: 'WK' },
];

export const ControlDock: React.FC<ControlDockProps> = ({
  sport,
  clubs,
  allStars,
  selectedClubId,
  selectedStarId,
  positionFilter,
  explodeTarget,
  autoRotate,
  showLabels,
  collapsed,
  onToggleCollapse,
  onSelectClub,
  onSelectStar,
  onChangePositionFilter,
  onChangeExplode,
  onToggleAutoRotate,
  onToggleLabels,
  onResetView,
}) => {
  const positionOptions =
    sport === 'cricket' ? CRICKET_POSITION_OPTIONS : FOOTBALL_POSITION_OPTIONS;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const selectedClub = useMemo(
    () => clubs.find((c) => c.id === selectedClubId) ?? null,
    [clubs, selectedClubId]
  );

  const selectedStar = useMemo(
    () => allStars.find((s) => s.id === selectedStarId) ?? null,
    [allStars, selectedStarId]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const clubMap = new Map(clubs.map((c) => [c.id, c]));
    return allStars
      .filter((s) => {
        const club = clubMap.get(s.clubId);
        return (
          s.name.toLowerCase().includes(q) ||
          (club && (club.name.toLowerCase().includes(q) || club.code.toLowerCase().includes(q)))
        );
      })
      .slice(0, 7)
      .map((star) => ({ star, club: clubMap.get(star.clubId)! }));
  }, [searchQuery, allStars, clubs]);


  return (
    <div
      className={`fixed bottom-4 left-1/2 z-20 w-[min(960px,94vw)] -translate-x-1/2 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        collapsed ? 'translate-y-[calc(100%+18px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand Handle Tab attached to top edge of dock */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          title="Toggle Controls (H)"
          className="flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/12 bg-[#0a0f18]/95 px-3.5 py-1 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Container (Solid rgba surface, zero backdrop-filter) */}
      <div className="rounded-xl border border-white/12 bg-[#0a0f18]/95 shadow-[0_20px_50px_rgba(0,0,0,0.75)] p-3">
        {/* Club Squad Roster Strip (Shown when a Club is focused and full star modal is not open) */}
        {selectedClub && !selectedStar && (
          <div className="mb-2.5 border-b border-white/10 pb-2.5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="inline-block h-4 w-1.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: selectedClub.primaryColor }}
                  />
                  <h2 className="font-display text-lg font-bold tracking-wide text-white truncate">
                    {selectedClub.name}
                  </h2>
                  <span className="hidden sm:inline text-xs text-slate-400">
                    {selectedClub.stadium} · {selectedClub.city} · Est. {selectedClub.founded}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="hidden md:inline font-mono-tabular text-xs text-slate-400">
                    {selectedClub.stars.length} Players · Sector {selectedClub.sectorLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectClub(null)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{sport === 'cricket' ? 'All Nations' : 'All Clubs'}</span>
                  </button>
                </div>
              </div>

              {/* Club Segregated Squad Roster Strip with Real Player Avatars (All 18 Players) */}
              <div className="club-scroll grid max-h-36 overflow-y-auto pr-1 grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
                {selectedClub.stars.map((star) => {
                  const dimmedByPos =
                    positionFilter !== 'ALL' && star.position !== positionFilter;
                  return (
                    <button
                      key={star.id}
                      type="button"
                      onClick={() => onSelectStar(star.id)}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                        dimmedByPos
                          ? 'border-white/5 bg-white/2 text-slate-500'
                          : 'border-white/10 bg-white/5 text-slate-100 hover:border-amber-300/60 hover:bg-white/10'
                      }`}
                    >
                      <PlayerAvatar star={star} club={selectedClub} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{star.name}</div>
                        <div className="flex items-center gap-1 font-mono-tabular text-[10px] text-slate-400">
                          <span className="text-amber-300">#{star.number}</span>
                          <span>·</span>
                          <span>{star.position}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Row 1: 20 Segregated Club Territories Strip */}
        <div className="club-scroll flex items-center gap-1.5 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => {
              onSelectStar(null);
              onSelectClub(null);
            }}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedClubId === null
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white'
            }`}
          >
            {sport === 'cricket' ? `All ${clubs.length} Nations` : `All ${clubs.length} Clubs`}
          </button>

          {clubs.map((club) => {
            const active = selectedClubId === club.id;
            return (
              <button
                key={club.id}
                type="button"
                onClick={() => {
                  onSelectStar(null);
                  onSelectClub(club.id);
                }}
                title={`${club.name} (${club.stadium})`}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white/18 text-white ring-1 ring-amber-300/80'
                    : 'bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white'
                }`}
              >
                <span
                  className="inline-block h-2.5 w-1 shrink-0 rounded-xs"
                  style={{ backgroundColor: club.primaryColor }}
                />
                <span className="font-display tracking-wider font-semibold">{club.code}</span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Position Filter, Quick Star Search, Orbit Lift, & View Actions */}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-white/8 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Position Filter Segmented Bar */}
            <div className="flex items-center gap-0.5 rounded-md bg-white/5 p-0.5">
              {positionOptions.map((opt) => {
                const active = positionFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangePositionFilter(opt.value)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-slate-100 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Quick Star / Club Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 160)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={sport === 'cricket' ? 'Find cricketer or nation...' : 'Find star or club...'}
                aria-label={sport === 'cricket' ? 'Search cricketer or nation' : 'Search Premier League star or club'}
                className="w-44 sm:w-52 rounded-md border border-white/10 bg-white/5 pl-8 pr-7 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/70 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {searchFocused && searchResults.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-white/15 bg-[#0b111c]/98 p-1 shadow-2xl z-30">
                  {searchResults.map(({ star, club }) => (
                    <button
                      key={star.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelectClub(club.id);
                        onSelectStar(star.id);
                        setSearchQuery('');
                        setSearchFocused(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-2.5 w-1 shrink-0"
                          style={{ backgroundColor: club.primaryColor }}
                        />
                        <span className="truncate font-medium text-slate-100">{star.name}</span>
                      </div>
                      <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                        {club.code} · {star.position}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Orbit Lift Slider & View Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-md bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              <span className="whitespace-nowrap">Orbit Lift</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explodeTarget}
                onChange={(e) => onChangeExplode(parseFloat(e.target.value))}
                className="w-20 accent-amber-400 cursor-pointer"
              />
            </label>

            <button
              type="button"
              onClick={onToggleAutoRotate}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoRotate
                  ? 'bg-white/16 text-amber-300'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Spin</span>
            </button>

            <button
              type="button"
              onClick={onToggleLabels}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showLabels
                  ? 'bg-white/16 text-amber-300'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {showLabels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Labels</span>
            </button>

            <button
              type="button"
              onClick={onResetView}
              className="flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/12 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
