import * as THREE from 'three';

export type SportMode = 'football' | 'cricket' | 'tennis';

export type FootballPosition = 'FW' | 'MF' | 'DF' | 'GK';

export type CricketRole = 'BAT' | 'AR' | 'BWL' | 'WK';

export type TennisRole = 'ATP' | 'WTA' | 'DBL' | 'LEG';

export type PlayerPosition = FootballPosition | CricketRole | TennisRole;

export type HeraldryPattern = 'halves' | 'stripes' | 'sash' | 'chevron' | 'hoops' | 'solid';

export interface StarPlayer {
  id: string;
  name: string;
  wikiTitle: string;
  clubId: string;
  sport?: SportMode;
  position: PlayerPosition;
  number: number;
  nationality: string;
  birthPlace: string;
  age: number;
  height: string;
  preferredFoot: 'Right' | 'Left' | 'Both';
  joinedClub: number;
  marquee: boolean;
  previousClubs: string[];
  internationalCaps: string;
  rating: number;
  goals: number;
  assists: number;
  appearances: number;
  signature: string;
  bio: string;
  achievements: string[];
  /** Unit normal on the globe sphere */
  unitPos: THREE.Vector3;
  /** Radial prominence factor for star scaling (0.85 - 1.15) */
  prominence: number;
}

export interface ClubSector {
  id: string;
  name: string;
  shortName: string;
  code: string;
  city: string;
  stadium: string;
  founded: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  heraldry: HeraldryPattern;
  sectorLabel: string;
  latDeg: number;
  lonDeg: number;
  anchorDir: THREE.Vector3;
  tangent: THREE.Vector3;
  bitangent: THREE.Vector3;
  stars: StarPlayer[];
}

export interface RawPlayer {
  name: string;
  wikiTitle?: string;
  position: PlayerPosition;
  number: number;
  nationality: string;
  birthPlace: string;
  age: number;
  height: string;
  preferredFoot: 'Right' | 'Left' | 'Both';
  joinedClub: number;
  marquee?: boolean;
  previousClubs: string[];
  internationalCaps: string;
  rating: number;
  goals: number;
  assists: number;
  appearances: number;
  signature: string;
  bio: string;
  achievements: string[];
}

export interface RawClub {
  id: string;
  name: string;
  shortName: string;
  code: string;
  city: string;
  stadium: string;
  founded: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  heraldry: HeraldryPattern;
  players: RawPlayer[];
}

export const GLOBE_RADIUS = 3.2;
