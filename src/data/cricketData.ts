import * as THREE from 'three';
import { CRICKET_TEAMS_A } from './cricketTeamsA';
import { CRICKET_TEAMS_B } from './cricketTeamsB';
import { ClubSector, RawClub, StarPlayer } from './premierLeagueTypes';

const RAW_CRICKET_TEAMS: RawClub[] = [...CRICKET_TEAMS_A, ...CRICKET_TEAMS_B];

/**
 * Generates evenly-distributed Fibonacci sphere positions for all 16 Cricket Nations,
 * keeping clear of the North/South polar brass spindles (|y| <= 0.82),
 * and places each nation's 12 stars in 2 concentric spherical rings inside its territory.
 */
export function buildCricketData(): {
  clubs: ClubSector[];
  allStars: StarPlayer[];
} {
  const count = RAW_CRICKET_TEAMS.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const clubs: ClubSector[] = [];
  const allStars: StarPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const raw = RAW_CRICKET_TEAMS[i];
    const t = (i + 0.5) / count;
    const y = 0.82 * (1 - 2 * t);
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = goldenAngle * i + 0.42;

    const anchorDir = new THREE.Vector3(
      Math.cos(phi) * radiusAtY,
      y,
      Math.sin(phi) * radiusAtY
    ).normalize();

    const latDeg = THREE.MathUtils.radToDeg(Math.asin(anchorDir.y));
    const lonDeg = THREE.MathUtils.radToDeg(Math.atan2(anchorDir.z, anchorDir.x));

    const worldUp =
      Math.abs(anchorDir.y) > 0.92
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(worldUp, anchorDir).normalize();
    const bitangent = new THREE.Vector3().crossVectors(anchorDir, tangent).normalize();

    const ring0Count = 4;
    const clubPhase = (i % 3) * 0.45;

    const stars: StarPlayer[] = raw.players.map((p, pIdx) => {
      let slotIdx = pIdx;
      let ringTotal = ring0Count;
      let radialDeg = 7.2;
      let phaseOffset = clubPhase + 0.18;

      if (pIdx >= ring0Count) {
        slotIdx = pIdx - ring0Count;
        ringTotal = Math.max(1, raw.players.length - ring0Count);
        radialDeg = 12.6;
        phaseOffset = clubPhase + 0.54;
      }

      const angle = (slotIdx / ringTotal) * Math.PI * 2 + phaseOffset;
      const alpha = THREE.MathUtils.degToRad(radialDeg);

      const offsetVec = new THREE.Vector3()
        .addScaledVector(tangent, Math.cos(angle) * Math.sin(alpha))
        .addScaledVector(bitangent, Math.sin(angle) * Math.sin(alpha));

      const unitPos = new THREE.Vector3()
        .copy(anchorDir)
        .multiplyScalar(Math.cos(alpha))
        .add(offsetVec)
        .normalize();

      const prominence = THREE.MathUtils.clamp(
        0.84 + ((p.rating - 75) / 22) * 0.31,
        0.84,
        1.15
      );

      const star: StarPlayer = {
        id: `cricket-${raw.id}-${p.number}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name: p.name,
        wikiTitle: p.wikiTitle ?? p.name.replace(/\s+/g, '_'),
        clubId: raw.id,
        sport: 'cricket',
        position: p.position,
        number: p.number,
        nationality: p.nationality,
        birthPlace: p.birthPlace,
        age: p.age,
        height: p.height,
        preferredFoot: p.preferredFoot,
        joinedClub: p.joinedClub,
        marquee: Boolean(p.marquee || pIdx < 4),
        previousClubs: p.previousClubs,
        internationalCaps: p.internationalCaps,
        rating: p.rating,
        goals: p.goals,
        assists: p.assists,
        appearances: p.appearances,
        signature: p.signature,
        bio: p.bio,
        achievements: p.achievements,
        unitPos,
        prominence,
      };
      allStars.push(star);
      return star;
    });

    const ns = latDeg >= 0 ? 'N' : 'S';
    const ew = lonDeg >= 0 ? 'E' : 'W';

    clubs.push({
      id: raw.id,
      name: raw.name,
      shortName: raw.shortName,
      code: raw.code,
      city: raw.city,
      stadium: raw.stadium,
      founded: raw.founded,
      primaryColor: raw.primaryColor,
      secondaryColor: raw.secondaryColor,
      accentColor: raw.accentColor,
      heraldry: raw.heraldry,
      sectorLabel: `${Math.abs(latDeg).toFixed(1)}°${ns} ${Math.abs(lonDeg).toFixed(1)}°${ew}`,
      latDeg,
      lonDeg,
      anchorDir,
      tangent,
      bitangent,
      stars,
    });
  }

  return { clubs, allStars };
}

export const CRICKET_WORLD_DATA = buildCricketData();
