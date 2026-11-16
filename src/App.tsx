/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { GlobeViewport } from './components/GlobeViewport';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { PREMIER_LEAGUE_DATA, PlayerPosition } from './data/premierLeagueData';

export default function App() {
  const { clubs, allStars } = PREMIER_LEAGUE_DATA;

  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [selectedStarId, setSelectedStarId] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<PlayerPosition | 'ALL'>('ALL');
  const [explodeTarget, setExplodeTarget] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [resetSignal, setResetSignal] = useState<number>(0);

  const selectedStar = useMemo(
    () => allStars.find((s) => s.id === selectedStarId) ?? null,
    [allStars, selectedStarId]
  );

  const selectedStarClub = useMemo(
    () => (selectedStar ? clubs.find((c) => c.id === selectedStar.clubId) ?? null : null),
    [clubs, selectedStar]
  );

  const handleSelectClub = useCallback((clubId: string | null) => {
    setSelectedClubId(clubId);
    if (clubId) setCollapsed(false);
  }, []);

  const handleSelectStar = useCallback((starId: string | null) => {
    setSelectedStarId(starId);
    if (starId) setCollapsed(false);
  }, []);

  const handleCycleClubStar = useCallback(
    (dir: -1 | 1) => {
      if (!selectedStarClub || !selectedStar) return;
      const idx = selectedStarClub.stars.findIndex((s) => s.id === selectedStar.id);
      if (idx === -1) return;
      const nextIdx =
        (idx + dir + selectedStarClub.stars.length) % selectedStarClub.stars.length;
      setSelectedStarId(selectedStarClub.stars[nextIdx].id);
    },
    [selectedStarClub, selectedStar]
  );

  const handleResetView = useCallback(() => {
    setSelectedStarId(null);
    setSelectedClubId(null);
    setPositionFilter('ALL');
    setExplodeTarget(0);
    setAutoRotate(true);
    setResetSignal((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setCollapsed((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (selectedStarId) {
          setSelectedStarId(null);
        } else if (selectedClubId) {
          setSelectedClubId(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedClubId, selectedStarId]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#060a11]">
      {/* Minimal Top-Left Title & Spec Header (Unboxed, Zero Pills, Zero Clutter) */}
      <header className="pointer-events-none fixed top-5 left-6 z-20">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-slate-50 leading-none">
          Premier League Globe
        </h1>
        <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
          <span>{clubs.length} Clubs</span>
          <span aria-hidden="true">·</span>
          <span>{allStars.length} Players</span>
          <span aria-hidden="true">·</span>
          <span>Segregated Team Territories</span>
        </p>
      </header>

      {/* Full-Bleed 3D WebGL Globe Viewport */}
      <GlobeViewport
        clubs={clubs}
        allStars={allStars}
        selectedClubId={selectedClubId}
        selectedStarId={selectedStarId}
        positionFilter={positionFilter}
        explodeTarget={explodeTarget}
        autoRotate={autoRotate}
        showLabels={showLabels}
        resetSignal={resetSignal}
        onSelectClub={handleSelectClub}
        onSelectStar={handleSelectStar}
      />

      {/* Full Untruncated Player Profile & Achievements Modal when a Player is Clicked */}
      {selectedStar && selectedStarClub && (
        <PlayerProfileModal
          star={selectedStar}
          club={selectedStarClub}
          onClose={() => setSelectedStarId(null)}
          onViewClubSquad={() => setSelectedStarId(null)}
          onPrevStar={() => handleCycleClubStar(-1)}
          onNextStar={() => handleCycleClubStar(1)}
        />
      )}

      {/* Unified Collapsible Bottom Control Dock */}
      <ControlDock
        clubs={clubs}
        allStars={allStars}
        selectedClubId={selectedClubId}
        selectedStarId={selectedStarId}
        positionFilter={positionFilter}
        explodeTarget={explodeTarget}
        autoRotate={autoRotate}
        showLabels={showLabels}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        onSelectClub={handleSelectClub}
        onSelectStar={handleSelectStar}
        onChangePositionFilter={setPositionFilter}
        onChangeExplode={setExplodeTarget}
        onToggleAutoRotate={() => setAutoRotate((prev) => !prev)}
        onToggleLabels={() => setShowLabels((prev) => !prev)}
        onResetView={handleResetView}
      />
    </main>
  );
}
