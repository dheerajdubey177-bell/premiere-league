import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ClubSector,
  GLOBE_RADIUS,
  PlayerPosition,
  StarPlayer,
} from '../data/premierLeagueData';
import { prefetchAllPlayerMedia, prioritizeClubMedia } from '../services/playerMediaService';
import { buildPremierLeagueGlobe, BuiltGlobeScene } from '../three/globeBuilder';
import { createGlobeTextures } from '../three/proceduralTextures';
import { PlayerAvatar } from './PlayerAvatar';

export interface GlobeViewportProps {
  clubs: ClubSector[];
  allStars: StarPlayer[];
  selectedClubId: string | null;
  selectedStarId: string | null;
  positionFilter: PlayerPosition | 'ALL';
  explodeTarget: number;
  autoRotate: boolean;
  showLabels: boolean;
  resetSignal: number;
  onSelectClub: (clubId: string | null) => void;
  onSelectStar: (starId: string | null) => void;
}

interface HoveredTooltipState {
  star: StarPlayer;
  club: ClubSector;
  x: number;
  y: number;
}

interface ProjectedLabel {
  club: ClubSector;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
}

interface ProjectedStarPin {
  star: StarPlayer;
  club: ClubSector;
  x: number;
  y: number;
  opacity: number;
  focused: boolean;
  filteredOut: boolean;
}

// Pre-allocated scratch math objects (Zero GC in render loop)
const _scratchDir = new THREE.Vector3();
const _scratchWorldPos = new THREE.Vector3();
const _scratchCamDir = new THREE.Vector3();
const _scratchTargetPos = new THREE.Vector3();
const _scratchRotQuat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);

export const GlobeViewport: React.FC<GlobeViewportProps> = ({
  clubs,
  allStars,
  selectedClubId,
  selectedStarId,
  positionFilter,
  explodeTarget,
  autoRotate,
  showLabels,
  resetSignal,
  onSelectClub,
  onSelectStar,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [contextLost, setContextLost] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredTooltipState | null>(null);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);
  const [projectedStarPins, setProjectedStarPins] = useState<ProjectedStarPin[]>([]);

  const clubMap = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  // Prefetch real player photos in background so portraits appear directly on the globe
  useEffect(() => {
    prefetchAllPlayerMedia(allStars);
  }, [allStars]);

  // Pause auto-rotation whenever the user hovers a star, portrait pin, or club marker
  const hoverPausedRef = useRef(false);

  // Mutable state bridge so React UI updates never tear down the WebGL scene
  const stateRef = useRef({
    selectedClubId,
    selectedStarId,
    positionFilter,
    explodeTarget,
    autoRotate,
    showLabels,
    onSelectClub,
    onSelectStar,
  });

  useEffect(() => {
    stateRef.current = {
      selectedClubId,
      selectedStarId,
      positionFilter,
      explodeTarget,
      autoRotate,
      showLabels,
      onSelectClub,
      onSelectStar,
    };
  }, [
    selectedClubId,
    selectedStarId,
    positionFilter,
    explodeTarget,
    autoRotate,
    showLabels,
    onSelectClub,
    onSelectStar,
  ]);

  // Camera flight target ref
  const cameraFlightRef = useRef<{
    active: boolean;
    targetCamPos: THREE.Vector3;
    distance: number;
  }>({
    active: false,
    targetCamPos: new THREE.Vector3(0, 1.4, 8.6),
    distance: 8.6,
  });

  // Reference to current globe spin group for computing world-space flight targets
  const globeSpinRef = useRef<THREE.Group | null>(null);

  // Trigger smooth camera flight when selectedStarId or selectedClubId changes
  useEffect(() => {
    const spinGroup = globeSpinRef.current;
    const rotY = spinGroup ? spinGroup.rotation.y : 0;
    _scratchRotQuat.setFromAxisAngle(_yAxis, rotY);

    if (selectedStarId) {
      const star = allStars.find((s) => s.id === selectedStarId);
      if (star) {
        _scratchDir.copy(star.unitPos).applyQuaternion(_scratchRotQuat).normalize();
        cameraFlightRef.current.distance = 6.2;
        cameraFlightRef.current.targetCamPos
          .copy(_scratchDir)
          .multiplyScalar(cameraFlightRef.current.distance);
        cameraFlightRef.current.targetCamPos.y += 0.25;
        cameraFlightRef.current.active = true;
        return;
      }
    }

    if (selectedClubId) {
      const club = clubs.find((c) => c.id === selectedClubId);
      if (club) {
        void prioritizeClubMedia(club.stars);
        _scratchDir.copy(club.anchorDir).applyQuaternion(_scratchRotQuat).normalize();
        cameraFlightRef.current.distance = 6.35;
        cameraFlightRef.current.targetCamPos
          .copy(_scratchDir)
          .multiplyScalar(cameraFlightRef.current.distance);
        cameraFlightRef.current.targetCamPos.y += 0.25;
        cameraFlightRef.current.active = true;
      }
    }
  }, [selectedClubId, selectedStarId, clubs, allStars]);

  // Trigger reset camera flight
  useEffect(() => {
    if (resetSignal === 0) return;
    cameraFlightRef.current.distance = 8.8;
    cameraFlightRef.current.targetCamPos.set(0, 1.6, 8.65);
    cameraFlightRef.current.active = true;
  }, [resetSignal]);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    // 1. Software-WebGL probe from renderer string (never UA)
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    // 2. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x060a11);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x060a11, 0.022);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(0, 1.6, 8.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mount.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // 3. Mandatory Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // 4. Studio 3-Point Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x8bb8f0, 0x0c1420, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.3);
    keyLight.position.set(6.5, 7.5, 6.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 22.0;
    keyLight.shadow.camera.left = -5.5;
    keyLight.shadow.camera.right = 5.5;
    keyLight.shadow.camera.top = 5.5;
    keyLight.shadow.camera.bottom = -5.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x5b96f0, 1.15);
    rimLight.position.set(-7.0, -2.5, -6.5);
    scene.add(rimLight);

    // 5. Build Procedural Textures & Composite Globe Assembly
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const textures = createGlobeTextures(clubs, maxAnisotropy);
    const builtGlobe: BuiltGlobeScene = buildPremierLeagueGlobe(clubs, allStars, textures);
    scene.add(builtGlobe.rootGroup);
    globeSpinRef.current = builtGlobe.globeSpinGroup;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 6. OrbitControls with Damping
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 4.6;
    controls.maxDistance = 14.5;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.85;
    controls.target.set(0, -0.15, 0);

    const onControlStart = () => {
      cameraFlightRef.current.active = false;
    };
    controls.addEventListener('start', onControlStart);

    // 7. Raycasting Setup (Layer 1 only for fast picking)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    const clickTargets: THREE.Object3D[] = [builtGlobe.starCoreMesh];
    builtGlobe.clubBeacons.forEach((b) => clickTargets.push(b.hitProxy));

    let hoveredStarIdx: number | null = null;
    let lastRaycastTime = 0;
    let pointerDownPos = { x: 0, y: 0 };

    const updatePointerNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastTime < 40) return;
      lastRaycastTime = now;

      updatePointerNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(clickTargets, false);

      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.object === builtGlobe.starCoreMesh && hit.instanceId !== undefined) {
          const idx = hit.instanceId;
          hoveredStarIdx = idx;
          hoverPausedRef.current = true;
          const meta = builtGlobe.starMeta[idx];
          if (meta) {
            renderer.domElement.style.cursor = 'pointer';
            setHoveredStarId(meta.star.id);
            setHoveredTooltip({
              star: meta.star,
              club: meta.club,
              x: e.clientX,
              y: e.clientY,
            });
            return;
          }
        } else if (hit.object.userData?.type === 'club') {
          hoveredStarIdx = null;
          hoverPausedRef.current = true;
          renderer.domElement.style.cursor = 'pointer';
          setHoveredStarId(null);
          setHoveredTooltip(null);
          return;
        }
      }

      if (hoveredStarIdx !== null || hoverPausedRef.current) {
        hoveredStarIdx = null;
        hoverPausedRef.current = false;
        renderer.domElement.style.cursor = 'grab';
        setHoveredStarId(null);
        setHoveredTooltip(null);
      }
    };

    const onPointerLeave = () => {
      hoveredStarIdx = null;
      hoverPausedRef.current = false;
      setHoveredStarId(null);
      setHoveredTooltip(null);
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 36) return;

      updatePointerNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(clickTargets, false);

      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.object === builtGlobe.starCoreMesh && hit.instanceId !== undefined) {
          const meta = builtGlobe.starMeta[hit.instanceId];
          if (meta) {
            stateRef.current.onSelectClub(meta.club.id);
            stateRef.current.onSelectStar(meta.star.id);
            return;
          }
        }
        if (hit.object.userData?.type === 'club') {
          const cId = hit.object.userData.clubId as string;
          stateRef.current.onSelectStar(null);
          stateRef.current.onSelectClub(cId);
          return;
        }
      }
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // 8. Resize Handler
    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // 9. Animation Loop with Software-WebGL afterDraw Pacing & Exponential Damping
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let currentExplode = 0;
    let lastOverlaySync = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function syncProjectedOverlays(nowMs: number, explodeFactor: number) {
      if (nowMs - lastOverlaySync < 28) return; // ~35fps smooth DOM projection
      lastOverlaySync = nowMs;

      const w = mount?.clientWidth || window.innerWidth;
      const h = mount?.clientHeight || window.innerHeight;
      const st = stateRef.current;

      _scratchCamDir.copy(camera.position).normalize();
      const rotY = builtGlobe.globeSpinGroup.rotation.y;
      _scratchRotQuat.setFromAxisAngle(_yAxis, rotY);

      // A. Club Sector Labels
      if (st.showLabels) {
        const nextLabels: ProjectedLabel[] = [];
        for (let i = 0; i < clubs.length; i++) {
          const club = clubs[i];
          _scratchDir.copy(club.anchorDir).applyQuaternion(_scratchRotQuat).normalize();
          const facing = _scratchDir.dot(_scratchCamDir);

          if (facing < 0.14) {
            nextLabels.push({ club, x: 0, y: 0, opacity: 0, visible: false });
            continue;
          }

          _scratchWorldPos.copy(_scratchDir).multiplyScalar(GLOBE_RADIUS + 0.56);
          _scratchWorldPos.project(camera);

          const sx = ((_scratchWorldPos.x + 1) / 2) * w;
          const sy = ((-_scratchWorldPos.y + 1) / 2) * h;

          const isSelected = st.selectedClubId === club.id;
          const anySelected = Boolean(st.selectedClubId);
          const baseOpacity = THREE.MathUtils.smoothstep(facing, 0.14, 0.45);
          const focusFactor = anySelected ? (isSelected ? 1.0 : 0.32) : 0.94;

          nextLabels.push({
            club,
            x: sx,
            y: sy,
            opacity: baseOpacity * focusFactor,
            visible: _scratchWorldPos.z < 1,
          });
        }
        setProjectedLabels(nextLabels);
      } else {
        setProjectedLabels((prev) => (prev.length > 0 ? [] : prev));
      }

      // B. Real Player Portrait Pins directly on the 3D Globe surface
      const liftOffset = explodeFactor * 0.68;
      const nextPins: ProjectedStarPin[] = [];
      const minFacing = st.selectedClubId ? 0.08 : 0.36;

      for (let i = 0; i < allStars.length; i++) {
        const star = allStars[i];
        const club = clubMap.get(star.clubId);
        if (!club) continue;

        const isClubSelected = st.selectedClubId === club.id;
        // When a club is focused, display all 18 of its players on the globe;
        // in global overview, show each club's marquee stars (all 20 teams) cleanly without overlap.
        if (st.selectedClubId) {
          if (!isClubSelected) continue;
        } else if (!star.marquee) {
          continue;
        }

        _scratchDir.copy(star.unitPos).applyQuaternion(_scratchRotQuat).normalize();
        const facing = _scratchDir.dot(_scratchCamDir);
        if (facing < minFacing) continue;

        _scratchWorldPos
          .copy(_scratchDir)
          .multiplyScalar(GLOBE_RADIUS + 0.18 + liftOffset);
        _scratchWorldPos.project(camera);

        if (_scratchWorldPos.z >= 1) continue;

        const sx = ((_scratchWorldPos.x + 1) / 2) * w;
        const sy = ((-_scratchWorldPos.y + 1) / 2) * h;

        const filteredOut =
          st.positionFilter !== 'ALL' && star.position !== st.positionFilter;
        const baseFade = THREE.MathUtils.smoothstep(facing, minFacing, minFacing + 0.24);
        const opacity = filteredOut ? baseFade * 0.25 : baseFade;

        nextPins.push({
          star,
          club,
          x: sx,
          y: sy,
          opacity,
          focused: isClubSelected || st.selectedStarId === star.id,
          filteredOut,
        });
      }

      setProjectedStarPins(nextPins);
    }

    function tick() {
      if (disposed) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      const st = stateRef.current;

      // Auto-rotate ONLY when enabled, no selection is active, AND pointer is NOT hovering any star/club
      if (
        st.autoRotate &&
        !st.selectedClubId &&
        !st.selectedStarId &&
        !hoverPausedRef.current
      ) {
        builtGlobe.globeSpinGroup.rotation.y += dt * 0.085;
      }

      builtGlobe.astrolabeOuterRing.rotation.y = Math.sin(elapsed * 0.18) * 0.12;
      builtGlobe.starfield.rotation.y += dt * 0.008;

      currentExplode = THREE.MathUtils.damp(currentExplode, st.explodeTarget, 6.5, dt);

      builtGlobe.updateDynamicLayout(
        currentExplode,
        st.selectedClubId,
        st.selectedStarId,
        hoveredStarIdx,
        st.positionFilter,
        elapsed
      );

      if (cameraFlightRef.current.active) {
        const lambda = 5.2;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          cameraFlightRef.current.targetCamPos.x,
          lambda,
          dt
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          cameraFlightRef.current.targetCamPos.y,
          lambda,
          dt
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          cameraFlightRef.current.targetCamPos.z,
          lambda,
          dt
        );

        _scratchTargetPos.copy(camera.position).sub(controls.target);
        if (_scratchTargetPos.distanceTo(cameraFlightRef.current.targetCamPos) < 0.04) {
          cameraFlightRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      syncProjectedOverlays(performance.now(), currentExplode);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      tick();
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);

      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();

      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);

      hoveredStarIdx = null;
      hoverPausedRef.current = false;
      setHoveredStarId(null);
      setHoveredTooltip(null);

      builtGlobe.dispose();
      textures.dispose();
      envTexture.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [clubs, allStars, clubMap]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#060a11]">
      {/* Dedicated WebGL Mount Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Projected 3D Player Portrait Pins & Club Labels Overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {/* Real Player Portrait Medallions directly on the Globe */}
        {projectedStarPins.map((pin) => {
          const isHovered = hoveredStarId === pin.star.id;
          const isSelected = selectedStarId === pin.star.id;
          const sizePx = isSelected || isHovered ? 40 : pin.focused ? 36 : 26;

          return (
            <button
              key={pin.star.id}
              type="button"
              onMouseEnter={(e) => {
                hoverPausedRef.current = true;
                setHoveredStarId(pin.star.id);
                setHoveredTooltip({
                  star: pin.star,
                  club: pin.club,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              onMouseMove={(e) => {
                setHoveredTooltip({
                  star: pin.star,
                  club: pin.club,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              onMouseLeave={() => {
                hoverPausedRef.current = false;
                setHoveredStarId(null);
                setHoveredTooltip(null);
              }}
              onClick={() => {
                setHoveredTooltip(null);
                onSelectClub(pin.club.id);
                onSelectStar(pin.star.id);
              }}
              style={{
                transform: `translate3d(${pin.x}px, ${pin.y}px, 0) translate(-50%, -50%)`,
                opacity: pin.opacity,
                width: `${sizePx}px`,
                height: `${sizePx}px`,
                borderColor: isSelected || isHovered ? '#fcd34d' : pin.club.primaryColor,
                zIndex: isSelected || isHovered ? 25 : pin.focused ? 15 : 10,
              }}
              aria-label={`${pin.star.name} (${pin.club.shortName})`}
              className="pointer-events-auto absolute top-0 left-0 rounded-full border-2 shadow-[0_2px_10px_rgba(0,0,0,0.85)] transition-[width,height,border-color] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              <PlayerAvatar star={pin.star} club={pin.club} size="xs" />
              {pin.focused && (
                <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-[#080d16]/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-100 shadow">
                  {pin.star.name.split(' ').slice(-1)[0]}
                </span>
              )}
            </button>
          );
        })}

        {/* Projected 3D Club Territory Labels */}
        {projectedLabels.map(
          (item) =>
            item.visible && (
              <button
                key={item.club.id}
                type="button"
                onMouseEnter={() => {
                  hoverPausedRef.current = true;
                }}
                onMouseLeave={() => {
                  hoverPausedRef.current = false;
                }}
                onClick={() => {
                  onSelectStar(null);
                  onSelectClub(item.club.id);
                }}
                style={{
                  transform: `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%)`,
                  opacity: item.opacity,
                }}
                className="pointer-events-auto absolute top-0 left-0 flex items-center gap-1.5 px-1.5 py-0.5 text-left transition-opacity duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300 z-20"
              >
                <span
                  className="inline-block w-2 h-2 shrink-0 rotate-45 border border-white/50"
                  style={{ backgroundColor: item.club.primaryColor }}
                />
                <span
                  className={`font-display text-xs font-semibold tracking-wider whitespace-nowrap drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] ${
                    selectedClubId === item.club.id ? 'text-amber-300' : 'text-slate-100'
                  }`}
                >
                  {item.club.code}
                </span>
              </button>
            )
        )}
      </div>

      {/* Hover Tooltip for Star Player Nodes (Solid rgba surface, no backdrop-filter) */}
      {hoveredTooltip && !selectedStarId && (
        <div
          className="pointer-events-none fixed z-30 w-[250px] rounded-lg border border-slate-700/80 bg-[#0b111c]/95 px-3 py-2.5 shadow-xl"
          style={{
            left: Math.min(hoveredTooltip.x + 18, window.innerWidth - 270),
            top: Math.max(hoveredTooltip.y - 24, 12),
          }}
        >
          <div className="flex items-center gap-2.5">
            <PlayerAvatar
              star={hoveredTooltip.star}
              club={hoveredTooltip.club}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-display text-base font-bold tracking-wide text-slate-50">
                  {hoveredTooltip.star.name}
                </span>
                <span className="font-mono-tabular text-xs font-semibold text-amber-300 shrink-0">
                  #{hoveredTooltip.star.number}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span
                  className="inline-block w-2 h-2 shrink-0"
                  style={{ backgroundColor: hoveredTooltip.club.primaryColor }}
                />
                <span className="truncate">{hoveredTooltip.club.shortName}</span>
                <span aria-hidden="true">·</span>
                <span>{hoveredTooltip.star.position}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-slate-300">
                  {hoveredTooltip.star.sport === 'cricket' || hoveredTooltip.star.sport === 'tennis'
                    ? 'RTG'
                    : 'OVR'}{' '}
                  {hoveredTooltip.star.rating}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 border-t border-slate-800 pt-1.5 text-[11px] text-slate-300 font-mono-tabular">
            {hoveredTooltip.star.sport === 'cricket' ? (
              <>
                <span>{hoveredTooltip.star.goals.toLocaleString()}R</span>
                <span>{hoveredTooltip.star.assists}W</span>
                <span>{hoveredTooltip.star.appearances} Mat</span>
              </>
            ) : hoveredTooltip.star.sport === 'tennis' ? (
              <>
                <span>{hoveredTooltip.star.goals} Titles</span>
                <span>{hoveredTooltip.star.assists} Slams</span>
                <span>{hoveredTooltip.star.appearances.toLocaleString()}W</span>
              </>
            ) : (
              <>
                <span>{hoveredTooltip.star.goals}G</span>
                <span>{hoveredTooltip.star.assists}A</span>
                <span>{hoveredTooltip.star.appearances} Apps</span>
              </>
            )}
          </div>
          {hoveredTooltip.star.achievements[0] && (
            <p className="mt-1 truncate text-[11px] text-amber-200/90">
              {hoveredTooltip.star.achievements[0]}
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-slate-400">
            Click photo for full profile & honours
          </p>
        </div>
      )}

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#060a11] text-center p-6">
          <p className="font-display text-2xl font-semibold text-slate-100">
            3D Viewport Paused
          </p>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            Graphics context was suspended by the browser. Reload or restore the tab to resume the 3D Sports Globe.
          </p>
        </div>
      )}
    </div>
  );
};
