import * as THREE from 'three';
import { ClubSector, RawClub, StarPlayer } from './premierLeagueTypes';
import { TENNIS_TEAMS_A } from './tennisTeamsA';
import { TENNIS_TEAMS_B } from './tennisTeamsB';

const RAW_TENNIS_TEAMS: RawClub[] = [...TENNIS_TEAMS_A, ...TENNIS_TEAMS_B];

/**
 * Generates evenly-distributed Fibonacci sphere positions for all 14 Tennis Nations,
 * keeping clear of the North/South polar brass spindles (|y| <= 0.80),
 * and places each nation's 10 stars in 2 concentric spherical rings inside its territory.
 */
export function buildTennisData(): {
  clubs: ClubSector[];
  allStars: StarPlayer[];
} {
  const count = RAW_TENNIS_TEAMS.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const clubs: ClubSector[] = [];
  const allStars: StarPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const raw = RAW_TENNIS_TEAMS[i];
    const t = (i + 0.5) / count;
    const y = 0.8 * (1 - 2 * t);
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = goldenAngle * i + 0.48;

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

    const ring0Count = 3;
    const clubPhase = (i % 3) * 0.45;

    const stars: StarPlayer[] = raw.players.map((p, pIdx) => {
      let slotIdx = pIdx;
      let ringTotal = ring0Count;
      let radialDeg = 6.8;
      let phaseOffset = clubPhase + 0.2;

      if (pIdx >= ring0Count) {
        slotIdx = pIdx - ring0Count;
        ringTotal = Math.max(1, raw.players.length - ring0Count);
        radialDeg = 12.2;
        phaseOffset = clubPhase + 0.58;
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
        0.84 + ((p.rating - 78) / 21) * 0.31,
        0.84,
        1.15
      );

      const star: StarPlayer = {
        id: `tennis-${raw.id}-${p.number}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name: p.name,
        wikiTitle: p.wikiTitle ?? p.name.replace(/\s+/g, '_'),
        clubId: raw.id,
        sport: 'tennis',
        position: p.position,
        number: p.number,
        nationality: p.nationality,
        birthPlace: p.birthPlace,
        age: p.age,
        height: p.height,
        preferredFoot: p.preferredFoot,
        joinedClub: p.joinedClub,
        marquee: Boolean(p.marquee || pIdx < 3),
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

export const TENNIS_WORLD_DATA = buildTennisData();
