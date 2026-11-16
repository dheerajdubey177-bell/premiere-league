import * as THREE from 'three';
import { CLUBS_GROUP_A } from './clubsGroupA';
import { CLUBS_GROUP_B } from './clubsGroupB';
import { CLUBS_GROUP_C } from './clubsGroupC';
import { CLUBS_GROUP_D } from './clubsGroupD';
import {
  ClubSector,
  GLOBE_RADIUS,
  HeraldryPattern,
  PlayerPosition,
  RawClub,
  RawPlayer,
  StarPlayer,
} from './premierLeagueTypes';

export type { ClubSector, HeraldryPattern, PlayerPosition, RawClub, RawPlayer, StarPlayer };
export { GLOBE_RADIUS };

const RAW_CLUBS: RawClub[] = [
  ...CLUBS_GROUP_A,
  ...CLUBS_GROUP_B,
  ...CLUBS_GROUP_C,
  ...CLUBS_GROUP_D,
];

/**
 * Generates evenly-distributed Fibonacci sphere positions for all 20 clubs,
 * keeping clear of the North/South polar brass spindles (|y| <= 0.84),
 * and places each club's full squad in 3 concentric spherical rings inside its territory.
 */
export function buildPremierLeagueData(): {
  clubs: ClubSector[];
  allStars: StarPlayer[];
} {
  const count = RAW_CLUBS.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const clubs: ClubSector[] = [];
  const allStars: StarPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const raw = RAW_CLUBS[i];
    const t = (i + 0.5) / count;
    const y = 0.84 * (1 - 2 * t);
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = goldenAngle * i + 0.35;

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

    // Sort a deterministic copy for ring placement (marquee + GK inner, DF mid, MF/FW outer)
    // while keeping raw.players order intact for squad list.
    const ring0Count = 4;
    const ring1Count = 6;
    const clubPhase = (i % 3) * 0.42;

    const stars: StarPlayer[] = raw.players.map((p, pIdx) => {
      let ringIdx = 0;
      let slotIdx = pIdx;
      let ringTotal = ring0Count;
      let radialDeg = 6.4;
      let phaseOffset = clubPhase;

      if (pIdx < ring0Count) {
        ringIdx = 0;
        slotIdx = pIdx;
        ringTotal = ring0Count;
        radialDeg = 6.4;
        phaseOffset = clubPhase + 0.15;
      } else if (pIdx < ring0Count + ring1Count) {
        ringIdx = 1;
        slotIdx = pIdx - ring0Count;
        ringTotal = ring1Count;
        radialDeg = 10.6;
        phaseOffset = clubPhase + 0.52;
      } else {
        ringIdx = 2;
        slotIdx = pIdx - ring0Count - ring1Count;
        ringTotal = Math.max(1, raw.players.length - ring0Count - ring1Count);
        radialDeg = 14.8;
        phaseOffset = clubPhase + 0.28 + ringIdx * 0.05;
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
        0.84 + ((p.rating - 75) / 16) * 0.31,
        0.84,
        1.15
      );

      const star: StarPlayer = {
        id: `${raw.id}-${p.number}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name: p.name,
        wikiTitle: p.wikiTitle ?? p.name.replace(/\s+/g, '_'),
        clubId: raw.id,
        position: p.position,
        number: p.number,
        nationality: p.nationality,
        birthPlace: p.birthPlace,
        age: p.age,
        height: p.height,
        preferredFoot: p.preferredFoot,
        joinedClub: p.joinedClub,
        marquee: Boolean(p.marquee || pIdx < 6),
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

export const PREMIER_LEAGUE_DATA = buildPremierLeagueData();
