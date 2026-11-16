import * as THREE from 'three';
import { ClubSector, GLOBE_RADIUS, PlayerPosition, StarPlayer } from '../data/premierLeagueData';
import { GlobeTextureSet } from './proceduralTextures';

export interface StarInstanceMeta {
  index: number;
  star: StarPlayer;
  club: ClubSector;
  baseColor: THREE.Color;
  dimColor: THREE.Color;
  highlightColor: THREE.Color;
  localQuat: THREE.Quaternion;
}

export interface ClubBeaconHandle {
  club: ClubSector;
  group: THREE.Group;
  ringMesh: THREE.Mesh;
  spireMesh: THREE.Mesh;
  hitProxy: THREE.Mesh;
  arcLines: THREE.Line[];
  arcMaterial: THREE.LineBasicMaterial;
}

export interface BuiltGlobeScene {
  rootGroup: THREE.Group;
  globeSpinGroup: THREE.Group;
  astrolabeOuterRing: THREE.Mesh;
  starCoreMesh: THREE.InstancedMesh;
  starBaseMesh: THREE.InstancedMesh;
  starMeta: StarInstanceMeta[];
  clubBeacons: Map<string, ClubBeaconHandle>;
  starfield: THREE.Points;
  updateDynamicLayout: (
    explodeFactor: number,
    selectedClubId: string | null,
    selectedStarId: string | null,
    hoveredStarIdx: number | null,
    positionFilter: PlayerPosition | 'ALL',
    elapsed: number
  ) => void;
  dispose: () => void;
}

// Pre-allocated math helpers (Zero GC in render loop)
const _up = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

function createHexPlinthGeometry(radius: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  // Rotate so extrusion points along +Y
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function createPolarFinialGeometry(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.32, 0.0),
    new THREE.Vector2(0.32, 0.05),
    new THREE.Vector2(0.22, 0.09),
    new THREE.Vector2(0.14, 0.16),
    new THREE.Vector2(0.18, 0.22),
    new THREE.Vector2(0.07, 0.34),
    new THREE.Vector2(0.09, 0.44),
    new THREE.Vector2(0.025, 0.62),
    new THREE.Vector2(0.0, 0.66),
  ];
  return new THREE.LatheGeometry(pts, 32);
}

function createEquatorialBezelGeometry(radius: number): THREE.LatheGeometry {
  const rIn = radius + 0.015;
  const rOut = radius + 0.11;
  const pts = [
    new THREE.Vector2(rIn, -0.055),
    new THREE.Vector2(rOut - 0.02, -0.055),
    new THREE.Vector2(rOut, -0.025),
    new THREE.Vector2(rOut, 0.025),
    new THREE.Vector2(rOut - 0.02, 0.055),
    new THREE.Vector2(rIn, 0.055),
  ];
  return new THREE.LatheGeometry(pts, 96);
}

function createPedestalRingGeometry(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(1.45, 0.0),
    new THREE.Vector2(2.25, 0.0),
    new THREE.Vector2(2.15, 0.08),
    new THREE.Vector2(1.85, 0.14),
    new THREE.Vector2(1.75, 0.22),
    new THREE.Vector2(1.52, 0.22),
    new THREE.Vector2(1.45, 0.0),
  ];
  return new THREE.LatheGeometry(pts, 64);
}

export function buildPremierLeagueGlobe(
  clubs: ClubSector[],
  allStars: StarPlayer[],
  textures: GlobeTextureSet
): BuiltGlobeScene {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const rootGroup = new THREE.Group();
  const globeSpinGroup = new THREE.Group();
  rootGroup.add(globeSpinGroup);

  // ---------------------------------------------------------------------------
  // 1. PRIMARY GLOBE CORE + ATMOSPHERIC FRESNEL RIM SHELL
  // ---------------------------------------------------------------------------
  const sphereGeo = track(new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48));
  const sphereMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.albedoMap,
      bumpMap: textures.bumpMap,
      bumpScale: 0.055,
      roughnessMap: textures.roughnessMap,
      roughness: 0.85,
      metalness: 0.22,
      envMapIntensity: 0.9,
    })
  );

  const globeCoreMesh = new THREE.Mesh(sphereGeo, sphereMat);
  globeCoreMesh.receiveShadow = true;
  globeCoreMesh.castShadow = true;
  globeSpinGroup.add(globeCoreMesh);

  // Subtle translucent atmospheric fresnel shell
  const atmosGeo = track(new THREE.SphereGeometry(GLOBE_RADIUS * 1.032, 48, 36));
  const atmosMat = track(
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vec3 viewDir = normalize(vViewPos);
          float fresnel = pow(1.0 - max(0.0, dot(viewDir, -vNormal)), 3.2);
          vec3 glow = mix(vec3(0.08, 0.24, 0.42), vec3(0.75, 0.62, 0.34), fresnel * 0.55);
          gl_FragColor = vec4(glow, fresnel * 0.34);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    })
  );
  const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
  globeSpinGroup.add(atmosMesh);

  // ---------------------------------------------------------------------------
  // 2. COMPOSITE ARMILLARY ASTROLABE FRAME (6+ PBR PARTS)
  // ---------------------------------------------------------------------------
  const brassMaterial = track(
    new THREE.MeshStandardMaterial({
      color: 0xd4b26a,
      metalness: 0.92,
      roughness: 0.24,
      envMapIntensity: 1.25,
    })
  );
  const darkGunmetalMaterial = track(
    new THREE.MeshStandardMaterial({
      color: 0x161d29,
      metalness: 0.72,
      roughness: 0.42,
      envMapIntensity: 0.9,
    })
  );

  // Equatorial Bezel Ring
  const eqBezelGeo = track(createEquatorialBezelGeometry(GLOBE_RADIUS));
  const eqBezelMesh = new THREE.Mesh(eqBezelGeo, brassMaterial);
  eqBezelMesh.castShadow = true;
  globeSpinGroup.add(eqBezelMesh);

  // North & South Polar Turned-Brass Finials
  const polarFinialGeo = track(createPolarFinialGeometry());
  const northFinial = new THREE.Mesh(polarFinialGeo, brassMaterial);
  northFinial.position.set(0, GLOBE_RADIUS - 0.03, 0);
  northFinial.castShadow = true;
  globeSpinGroup.add(northFinial);

  const southFinial = new THREE.Mesh(polarFinialGeo, brassMaterial);
  southFinial.rotation.x = Math.PI;
  southFinial.position.set(0, -GLOBE_RADIUS + 0.03, 0);
  southFinial.castShadow = true;
  globeSpinGroup.add(southFinial);

  // Outer Engraved Meridian Astrolabe Ring (Stationary cradle around the globe)
  const degreeBandGeo = track(
    new THREE.CylinderGeometry(GLOBE_RADIUS + 0.62, GLOBE_RADIUS + 0.62, 0.14, 96, 1, true)
  );
  const degreeBandMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.degreeRingMap,
      metalness: 0.78,
      roughness: 0.32,
      side: THREE.DoubleSide,
    })
  );
  const astrolabeOuterRing = new THREE.Mesh(degreeBandGeo, degreeBandMat);
  astrolabeOuterRing.rotation.z = THREE.MathUtils.degToRad(23.4);
  astrolabeOuterRing.rotation.x = THREE.MathUtils.degToRad(12);
  rootGroup.add(astrolabeOuterRing);

  // Outer Machined Gimbal Rim
  const gimbalTorusGeo = track(new THREE.TorusGeometry(GLOBE_RADIUS + 0.76, 0.032, 16, 120));
  const gimbalMesh = new THREE.Mesh(gimbalTorusGeo, darkGunmetalMaterial);
  gimbalMesh.rotation.y = Math.PI / 4;
  gimbalMesh.rotation.x = Math.PI / 2 - 0.2;
  rootGroup.add(gimbalMesh);

  // Grounded Studio Pedestal Ring + Radial Contact Shadow underneath
  const pedestalY = -GLOBE_RADIUS - 1.15;
  const pedestalGeo = track(createPedestalRingGeometry());
  const pedestalMesh = new THREE.Mesh(pedestalGeo, darkGunmetalMaterial);
  pedestalMesh.position.set(0, pedestalY, 0);
  pedestalMesh.receiveShadow = true;
  rootGroup.add(pedestalMesh);

  const pedestalTrimGeo = track(new THREE.TorusGeometry(1.78, 0.02, 12, 72));
  pedestalTrimGeo.rotateX(Math.PI / 2);
  const pedestalTrim = new THREE.Mesh(pedestalTrimGeo, brassMaterial);
  pedestalTrim.position.set(0, pedestalY + 0.22, 0);
  rootGroup.add(pedestalTrim);

  const shadowPlaneGeo = track(new THREE.PlaneGeometry(9.6, 9.6));
  shadowPlaneGeo.rotateX(-Math.PI / 2);
  const shadowPlaneMat = track(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    })
  );
  const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
  shadowPlane.position.set(0, pedestalY - 0.01, 0);
  rootGroup.add(shadowPlane);

  // ---------------------------------------------------------------------------
  // 3. 20 SEGREGATED CLUB BEACON MONUMENTS (5-PART COMPOSITE GROUP EACH)
  // ---------------------------------------------------------------------------
  const sharedPlinthGeo = track(createHexPlinthGeometry(0.145, 0.05));
  const sharedCollarGeo = track(new THREE.CylinderGeometry(0.088, 0.115, 0.045, 18));
  const sharedSpireGeo = track(new THREE.CylinderGeometry(0.022, 0.068, 0.24, 16));
  const sharedMedallionGeo = track(new THREE.CylinderGeometry(0.11, 0.11, 0.024, 28));
  const sharedHaloGeo = track(new THREE.TorusGeometry(0.24, 0.008, 8, 42));
  sharedHaloGeo.rotateX(Math.PI / 2);
  const sharedOuterRingGeo = track(new THREE.TorusGeometry(0.84, 0.005, 8, 60));
  sharedOuterRingGeo.rotateX(Math.PI / 2);
  const sharedProxyGeo = track(new THREE.SphereGeometry(0.28, 12, 10));
  const proxyMat = track(new THREE.MeshBasicMaterial({ visible: false }));

  const clubBeacons = new Map<string, ClubBeaconHandle>();

  for (const club of clubs) {
    const clubGroup = new THREE.Group();
    const surfacePos = club.anchorDir.clone().multiplyScalar(GLOBE_RADIUS - 0.015);
    clubGroup.position.copy(surfacePos);
    clubGroup.quaternion.setFromUnitVectors(_up, club.anchorDir);

    // Part 1: Matte Anodized Hex Plinth
    const plinthMesh = new THREE.Mesh(sharedPlinthGeo, darkGunmetalMaterial);
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    clubGroup.add(plinthMesh);

    // Part 2: Brushed Brass Collar
    const collarMesh = new THREE.Mesh(sharedCollarGeo, brassMaterial);
    collarMesh.position.y = 0.07;
    clubGroup.add(collarMesh);

    // Part 3: Team-Colored Spire
    const spireMat = track(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(club.primaryColor),
        emissive: new THREE.Color(club.primaryColor),
        emissiveIntensity: 0.22,
        roughness: 0.34,
        metalness: 0.45,
      })
    );
    const spireMesh = new THREE.Mesh(sharedSpireGeo, spireMat);
    spireMesh.position.y = 0.21;
    spireMesh.castShadow = true;
    clubGroup.add(spireMesh);

    // Part 4: Club Crest Medallion Plaque at Crest Top
    const crestTex = textures.crestMaps.get(club.id)!;
    const medallionMat = track(
      new THREE.MeshStandardMaterial({
        map: crestTex,
        roughness: 0.28,
        metalness: 0.12,
      })
    );
    const medallionMesh = new THREE.Mesh(sharedMedallionGeo, medallionMat);
    medallionMesh.position.y = 0.36;
    // Rotate medallion slightly so the circular crest faces outward along surface normal (+Y in local)
    clubGroup.add(medallionMesh);

    // Part 5: Segregated Sector Boundary Halo
    const haloMat = track(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(club.primaryColor),
        emissive: new THREE.Color(club.primaryColor),
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.8,
        transparent: true,
        opacity: 0.72,
      })
    );
    const ringMesh = new THREE.Mesh(sharedHaloGeo, haloMat);
    ringMesh.position.y = 0.04;
    clubGroup.add(ringMesh);

    const outerSectorMesh = new THREE.Mesh(sharedOuterRingGeo, haloMat);
    outerSectorMesh.position.y = -0.05;
    clubGroup.add(outerSectorMesh);

    // Invisible Raycast Proxy on Layer 1
    const hitProxy = new THREE.Mesh(sharedProxyGeo, proxyMat);
    hitProxy.position.y = 0.2;
    hitProxy.layers.set(1);
    hitProxy.userData = { type: 'club', clubId: club.id };
    clubGroup.add(hitProxy);

    globeSpinGroup.add(clubGroup);

    // Team Constellation Filaments (curved lines connecting club beacon to its 6 stars + perimeter)
    const arcMaterial = track(
      new THREE.LineBasicMaterial({
        color: new THREE.Color(club.primaryColor).lerp(new THREE.Color('#ffffff'), 0.28),
        transparent: true,
        opacity: 0.52,
      })
    );

    const arcLines: THREE.Line[] = [];
    // Hub-to-star spokes
    for (let sIdx = 0; sIdx < club.stars.length; sIdx++) {
      const lineGeo = track(new THREE.BufferGeometry());
      const positions = new Float32Array(13 * 3); // 13 curve segments
      lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(lineGeo, arcMaterial);
      globeSpinGroup.add(line);
      arcLines.push(line);
    }

    clubBeacons.set(club.id, {
      club,
      group: clubGroup,
      ringMesh,
      spireMesh,
      hitProxy,
      arcLines,
      arcMaterial,
    });
  }

  // ---------------------------------------------------------------------------
  // 4. 360 STAR PLAYER NODES (INSTANCED MESHES WITH PER-TEAM COLORING)
  // ---------------------------------------------------------------------------
  const starGeo = track(new THREE.OctahedronGeometry(0.056, 0));
  // Elongate subtly into a crystalline diamond beacon
  starGeo.scale(0.85, 1.45, 0.85);

  const starMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.55,
      emissive: 0x111827,
      emissiveIntensity: 0.35,
    })
  );

  const starCoreMesh = new THREE.InstancedMesh(starGeo, starMat, allStars.length);
  starCoreMesh.castShadow = true;
  starCoreMesh.layers.enable(1); // Allow layer-1 raycasting directly on InstancedMesh
  starCoreMesh.userData = { type: 'stars' };

  const starBaseGeo = track(new THREE.TorusGeometry(0.052, 0.009, 8, 20));
  starBaseGeo.rotateX(Math.PI / 2);
  const starBaseMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd4b26a,
      metalness: 0.9,
      roughness: 0.24,
    })
  );
  const starBaseMesh = new THREE.InstancedMesh(starBaseGeo, starBaseMat, allStars.length);

  const clubMap = new Map(clubs.map((c) => [c.id, c]));
  const starMeta: StarInstanceMeta[] = [];

  for (let i = 0; i < allStars.length; i++) {
    const star = allStars[i];
    const club = clubMap.get(star.clubId)!;

    const baseColor = new THREE.Color(club.primaryColor);
    // Ensure very dark club colors (e.g. Newcastle charcoal) still read brightly on the globe
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);
    if (hsl.l < 0.38) {
      baseColor.setHSL(hsl.h, Math.max(hsl.s, 0.2), 0.58);
    }

    const dimColor = baseColor.clone().multiplyScalar(0.22);
    const highlightColor = baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.45);
    const localQuat = new THREE.Quaternion().setFromUnitVectors(_up, star.unitPos);

    starMeta.push({
      index: i,
      star,
      club,
      baseColor,
      dimColor,
      highlightColor,
      localQuat,
    });

    starCoreMesh.setColorAt(i, baseColor);
    starBaseMesh.setColorAt(i, new THREE.Color(club.accentColor));
  }

  if (starCoreMesh.instanceColor) starCoreMesh.instanceColor.needsUpdate = true;
  if (starBaseMesh.instanceColor) starBaseMesh.instanceColor.needsUpdate = true;

  globeSpinGroup.add(starCoreMesh);
  globeSpinGroup.add(starBaseMesh);

  // ---------------------------------------------------------------------------
  // 5. DISTANT CELESTIAL STARFIELD BACKDROP
  // ---------------------------------------------------------------------------
  const starCount = 650;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 18 + Math.random() * 24;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starfieldGeo = track(new THREE.BufferGeometry());
  starfieldGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starfieldMat = track(
    new THREE.PointsMaterial({
      color: 0x9cb4d4,
      size: 0.08,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    })
  );
  const starfield = new THREE.Points(starfieldGeo, starfieldMat);
  rootGroup.add(starfield);

  // ---------------------------------------------------------------------------
  // 6. DYNAMIC UPDATE (EXPLODE LIFT, HIGHLIGHTING, FILTERING)
  // ---------------------------------------------------------------------------
  const _hubPos = new THREE.Vector3();
  const _starPos = new THREE.Vector3();
  const _midPos = new THREE.Vector3();

  let firstUpdate = true;

  function updateDynamicLayout(
    explodeFactor: number,
    selectedClubId: string | null,
    selectedStarId: string | null,
    hoveredStarIdx: number | null,
    positionFilter: PlayerPosition | 'ALL',
    elapsed: number
  ) {
    const liftOffset = explodeFactor * 0.68;

    // Update Star Instances
    for (let i = 0; i < starMeta.length; i++) {
      const meta = starMeta[i];
      const { star, club } = meta;

      const isSelectedStar = selectedStarId === star.id;
      const isHovered = hoveredStarIdx === i;
      const clubActive = !selectedClubId || selectedClubId === club.id;
      const posActive = positionFilter === 'ALL' || star.position === positionFilter;
      const isActive = clubActive && posActive;

      const bob = Math.sin(elapsed * 2.1 + i * 0.6) * (isSelectedStar || isHovered ? 0.035 : 0.012);
      const radialDist = GLOBE_RADIUS + 0.14 + liftOffset + bob;

      // Core star position & scale
      _pos.copy(star.unitPos).multiplyScalar(radialDist);
      _quat.copy(meta.localQuat);

      const scaleBase = star.prominence * (isSelectedStar ? 1.65 : isHovered ? 1.45 : isActive ? 1.0 : 0.52);
      _scale.set(scaleBase, scaleBase, scaleBase);
      _mat4.compose(_pos, _quat, _scale);
      starCoreMesh.setMatrixAt(i, _mat4);

      // Pedestal ring stays flush on globe surface
      _pos.copy(star.unitPos).multiplyScalar(GLOBE_RADIUS + 0.012);
      const ringScale = isSelectedStar ? 1.45 : isActive ? 1.0 : 0.6;
      _scale.set(ringScale, ringScale, ringScale);
      _mat4.compose(_pos, _quat, _scale);
      starBaseMesh.setMatrixAt(i, _mat4);

      // Color modulation
      if (isSelectedStar || isHovered) {
        _color.copy(meta.highlightColor);
      } else if (isActive) {
        _color.copy(meta.baseColor);
      } else {
        _color.copy(meta.dimColor);
      }
      starCoreMesh.setColorAt(i, _color);
    }

    starCoreMesh.instanceMatrix.needsUpdate = true;
    starBaseMesh.instanceMatrix.needsUpdate = true;
    if (starCoreMesh.instanceColor) starCoreMesh.instanceColor.needsUpdate = true;

    if (firstUpdate) {
      starCoreMesh.computeBoundingSphere();
      starBaseMesh.computeBoundingSphere();
      firstUpdate = false;
    }

    // Update Club Beacons & Constellation Filaments
    clubBeacons.forEach((handle, cId) => {
      const isClubFocused = !selectedClubId || selectedClubId === cId;
      const isExactClub = selectedClubId === cId;

      const ringMat = handle.ringMesh.material as THREE.MeshStandardMaterial;
      const spireMat = handle.spireMesh.material as THREE.MeshStandardMaterial;

      ringMat.opacity = isExactClub ? 0.95 : isClubFocused ? 0.65 : 0.16;
      ringMat.emissiveIntensity = isExactClub ? 1.15 : isClubFocused ? 0.5 : 0.1;
      spireMat.emissiveIntensity = isExactClub ? 0.65 : isClubFocused ? 0.22 : 0.05;

      const ringPulse = isExactClub ? 1.16 + Math.sin(elapsed * 3.0) * 0.05 : 1.0;
      handle.ringMesh.scale.set(ringPulse, 1, ringPulse);

      handle.arcMaterial.opacity = isExactClub ? 0.9 : isClubFocused ? 0.44 : 0.08;

      // Update curved spoke points for exploded view
      _hubPos.copy(handle.club.anchorDir).multiplyScalar(GLOBE_RADIUS + 0.18 + liftOffset * 0.45);

      for (let sIdx = 0; sIdx < handle.club.stars.length; sIdx++) {
        const star = handle.club.stars[sIdx];
        const line = handle.arcLines[sIdx];
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;

        _starPos.copy(star.unitPos).multiplyScalar(GLOBE_RADIUS + 0.11 + liftOffset);
        _midPos.copy(_hubPos).add(_starPos).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS + 0.24 + liftOffset * 0.85);

        const steps = 12;
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const omt = 1 - t;
          // Quadratic Bezier interpolation (zero heap allocation)
          const px = omt * omt * _hubPos.x + 2 * omt * t * _midPos.x + t * t * _starPos.x;
          const py = omt * omt * _hubPos.y + 2 * omt * t * _midPos.y + t * t * _starPos.y;
          const pz = omt * omt * _hubPos.z + 2 * omt * t * _midPos.z + t * t * _starPos.z;
          posAttr.setXYZ(k, px, py, pz);
        }
        posAttr.needsUpdate = true;
      }
    });
  }

  // Initial pose
  updateDynamicLayout(0, null, null, null, 'ALL', 0);

  return {
    rootGroup,
    globeSpinGroup,
    astrolabeOuterRing,
    starCoreMesh,
    starBaseMesh,
    starMeta,
    clubBeacons,
    starfield,
    updateDynamicLayout,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
