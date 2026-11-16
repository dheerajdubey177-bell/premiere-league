import React from 'react';
import { Award, ChevronLeft, ChevronRight, Users, X } from 'lucide-react';
import { ClubSector, StarPlayer } from '../data/premierLeagueData';
import { PlayerAvatar } from './PlayerAvatar';

export interface PlayerProfileModalProps {
  star: StarPlayer;
  club: ClubSector;
  onClose: () => void;
  onViewClubSquad: () => void;
  onPrevStar: () => void;
  onNextStar: () => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  star,
  club,
  onClose,
  onViewClubSquad,
  onPrevStar,
  onNextStar,
}) => {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${star.name} player profile and achievements`}
    >
      {/* Solid dark rgba card (no backdrop-filter over WebGL) */}
      <div className="pointer-events-auto relative w-full max-w-3xl max-h-[84vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0a101b]/97 shadow-[0_28px_70px_rgba(0,0,0,0.85)] p-5 sm:p-6">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="inline-block h-4 w-1.5 shrink-0 rounded-xs"
              style={{ backgroundColor: club.primaryColor }}
            />
            <span className="font-display text-sm font-semibold tracking-wider text-slate-300 truncate">
              {club.name} · {club.stadium}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onPrevStar}
              title="Previous club star"
              className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNextStar}
              title="Next club star"
              className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onViewClubSquad}
              className="ml-1 flex items-center gap-1.5 rounded-md bg-white/8 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/15 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{star.sport === 'cricket' ? 'Team Squad' : 'Club Squad'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player profile"
              className="ml-1 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Split */}
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Left Column: Real Photo + Season Telemetry */}
          <div className="flex flex-row sm:flex-col items-center sm:items-stretch gap-4 shrink-0">
            <PlayerAvatar star={star} club={club} size="lg" />

            <div className="grid grid-cols-2 gap-2 flex-1 sm:flex-none rounded-xl border border-white/10 bg-white/4 p-3 font-mono-tabular">
              <div>
                <div className="text-[11px] text-slate-400">
                  {star.sport === 'cricket' ? 'Rating' : 'Overall'}
                </div>
                <div className="text-lg font-bold text-amber-300">{star.rating}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">
                  {star.sport === 'cricket' ? 'Matches' : 'Apps'}
                </div>
                <div className="text-lg font-bold text-white">{star.appearances}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">
                  {star.sport === 'cricket' ? 'Runs' : 'Goals'}
                </div>
                <div className="text-lg font-bold text-white">
                  {star.goals.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">
                  {star.sport === 'cricket' ? 'Wickets' : 'Assists'}
                </div>
                <div className="text-lg font-bold text-white">{star.assists}</div>
              </div>
            </div>
          </div>

          {/* Right Column: Complete Info & Career Honours */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="font-display text-3xl font-bold tracking-wide text-white leading-none">
                {star.name}
              </h2>
              <span className="font-mono-tabular text-base font-semibold text-amber-300">
                #{star.number}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
              <span>{star.position}</span>
              <span aria-hidden="true">·</span>
              <span>{star.nationality}</span>
              <span aria-hidden="true">·</span>
              <span>Born in {star.birthPlace}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-200">{star.signature}</span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              {star.bio}
            </p>

            {/* Full Physical & Career Metadata Grid */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-y border-white/10 py-3 text-xs">
              <div>
                <div className="text-slate-400">Age</div>
                <div className="mt-0.5 font-mono-tabular font-semibold text-white">
                  {star.age} yrs
                </div>
              </div>
              <div>
                <div className="text-slate-400">Height</div>
                <div className="mt-0.5 font-mono-tabular font-semibold text-white">
                  {star.height}
                </div>
              </div>
              <div>
                <div className="text-slate-400">
                  {star.sport === 'cricket' ? 'Batting Hand' : 'Preferred Foot'}
                </div>
                <div className="mt-0.5 font-semibold text-white">
                  {star.preferredFoot}
                </div>
              </div>
              <div>
                <div className="text-slate-400">
                  {star.sport === 'cricket' ? 'Int’l Debut' : `Joined ${club.shortName}`}
                </div>
                <div className="mt-0.5 font-mono-tabular font-semibold text-white">
                  {star.joinedClub}
                </div>
              </div>
            </div>

            {/* International Record & Career Path */}
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex flex-wrap gap-x-2">
                <span className="text-slate-400">
                  {star.sport === 'cricket' ? 'Format Caps:' : 'International Record:'}
                </span>
                <span className="font-medium text-slate-100">{star.internationalCaps}</span>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <span className="text-slate-400">
                  {star.sport === 'cricket' ? 'Franchise & Domestic:' : 'Previous Clubs:'}
                </span>
                <span className="font-medium text-slate-200">
                  {star.previousClubs.join(' · ')}
                </span>
              </div>
            </div>

            {/* Full Untruncated Achievements & Honours */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/4 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <Award className="w-4 h-4 shrink-0" />
                <span>Career Achievements & Major Honours ({star.achievements.length})</span>
              </div>
              <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {star.achievements.map((achievement) => (
                  <li
                    key={achievement}
                    className="flex items-start gap-2 text-xs leading-snug text-slate-100"
                  >
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rotate-45 bg-amber-400" />
                    <span>{achievement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
