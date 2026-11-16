import React, { useEffect, useState } from 'react';
import { ClubSector, StarPlayer } from '../data/premierLeagueData';
import { recoverBrokenPhoto, usePlayerMedia } from '../services/playerMediaService';

export interface PlayerAvatarProps {
  star: StarPlayer;
  club: ClubSector;
  size?: 'xs' | 'sm' | 'lg';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  star,
  club,
  size = 'lg',
}) => {
  const { media, loading } = usePlayerMedia(star);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [star.id, media?.photoUrl]);

  const photoUrl = media?.photoUrl ?? null;
  const showImage = Boolean(photoUrl) && !imgFailed;
  const initials = getInitials(star.name);

  const handleImgError = () => {
    if (photoUrl) recoverBrokenPhoto(star, photoUrl);
    setImgFailed(true);
  };

  if (size === 'xs') {
    return (
      <div
        className="relative h-full w-full overflow-hidden rounded-full bg-[#0d1422]"
        style={{
          backgroundImage: `linear-gradient(135deg, ${club.primaryColor}88, #0d1422)`,
        }}
      >
        {showImage ? (
          <img
            src={photoUrl!}
            alt={star.name}
            referrerPolicy="no-referrer"
            decoding="async"
            onError={handleImgError}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-[9px] font-bold tracking-tight text-white">
            {initials}
          </div>
        )}
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div
        className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/20 bg-[#0f1726]"
        style={{
          backgroundImage: `linear-gradient(135deg, ${club.primaryColor}55, #0d1422)`,
        }}
      >
        {showImage ? (
          <img
            src={photoUrl!}
            alt={star.name}
            referrerPolicy="no-referrer"
            decoding="async"
            onError={handleImgError}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-[11px] font-bold tracking-wider text-slate-200">
            {initials}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative h-40 w-32 sm:h-52 sm:w-40 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-[#0c1320]"
      style={{
        backgroundImage: `linear-gradient(160deg, ${club.primaryColor}66 0%, #0b111d 70%)`,
      }}
    >
      {showImage ? (
        <img
          src={photoUrl!}
          alt={`${star.name} portrait`}
          referrerPolicy="no-referrer"
          decoding="async"
          onError={handleImgError}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center p-3 text-center">
          <span className="font-mono-tabular text-3xl font-bold text-amber-300/90">
            #{star.number}
          </span>
          <span className="mt-1.5 font-display text-2xl font-bold tracking-wider text-white">
            {loading ? '...' : initials}
          </span>
          <span className="mt-1 text-xs text-slate-300">{club.shortName}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/65 to-transparent px-2.5 py-2 text-xs">
        <span className="font-mono-tabular font-semibold text-amber-300">
          #{star.number}
        </span>
        <span className="font-semibold text-slate-100">{star.position}</span>
      </div>
    </div>
  );
};
