import * as THREE from 'three';
import { ClubSector } from '../data/premierLeagueData';

export interface GlobeTextureSet {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  degreeRingMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  crestMaps: Map<string, THREE.CanvasTexture>;
  dispose: () => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Generates an equirectangular Voronoi Territory Albedo, Bump, and Roughness map
 * whose UV spherical mapping aligns pixel-for-pixel with Three.js SphereGeometry.
 */
function createVoronoiGlobeTextures(
  clubs: ClubSector[],
  maxAnisotropy: number
): {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const width = 1024;
  const height = 512;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const albedoCtx = albedoCanvas.getContext('2d')!;
  const albedoImg = albedoCtx.createImageData(width, height);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const bumpImg = bumpCtx.createImageData(width, height);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const roughCtx = roughCanvas.getContext('2d')!;
  const roughImg = roughCtx.createImageData(width, height);

  const clubDirs = clubs.map((c) => ({
    x: c.anchorDir.x,
    y: c.anchorDir.y,
    z: c.anchorDir.z,
    rgb: hexToRgb(c.primaryColor),
    secRgb: hexToRgb(c.secondaryColor),
  }));

  const aData = albedoImg.data;
  const bData = bumpImg.data;
  const rData = roughImg.data;

  // Precompute sin/cos tables for speed
  const cosPhi = new Float32Array(width);
  const sinPhi = new Float32Array(width);
  for (let px = 0; px < width; px++) {
    const u = px / width;
    const phi = u * Math.PI * 2;
    cosPhi[px] = Math.cos(phi);
    sinPhi[px] = Math.sin(phi);
  }

  for (let py = 0; py < height; py++) {
    // Three.js SphereGeometry: top of canvas (py=0) -> v=1 -> theta=0 (+Y pole)
    const theta = (py / (height - 1)) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    // Subtle latitude tactical rings every 15 degrees
    const latDeg = Math.abs(90 - (py / (height - 1)) * 180);
    const latGrid = Math.abs((latDeg % 15) - 7.5);
    const isLatLine = latGrid > 7.22;
    const isPolarCap = latDeg > 66;

    for (let px = 0; px < width; px++) {
      // Exact Three.js SphereGeometry surface normal
      const nx = -cosPhi[px] * sinTheta;
      const ny = cosTheta;
      const nz = sinPhi[px] * sinTheta;

      // Find nearest & second nearest club anchor (max dot product)
      let bestDot = -2;
      let secondDot = -2;
      let bestIdx = 0;

      for (let i = 0; i < clubDirs.length; i++) {
        const c = clubDirs[i];
        const d = nx * c.x + ny * c.y + nz * c.z;
        if (d > bestDot) {
          secondDot = bestDot;
          bestDot = d;
          bestIdx = i;
        } else if (d > secondDot) {
          secondDot = d;
        }
      }

      const club = clubDirs[bestIdx];
      const borderDelta = bestDot - secondDot;

      // Subtle longitude graticule every 18 degrees
      const lonDeg = (px / width) * 360;
      const lonGrid = Math.abs((lonDeg % 18) - 9);
      const isLonLine = lonGrid > 8.78 && latDeg < 72;

      // Base deep slate-pitch obsidian color tinted subtly by club territory
      const tintStrength = isPolarCap ? 0.05 : 0.14;
      let r = 10 + club.rgb[0] * tintStrength;
      let g = 16 + club.rgb[1] * tintStrength;
      let b = 26 + club.rgb[2] * tintStrength;

      // Subtle concentric pitch rings around each club's central anchor
      const angDist = Math.acos(Math.min(1, Math.max(-1, bestDot)));
      const ringWave = Math.abs((angDist * 57.2958) % 6.0);
      const isClubRing = ringWave < 0.22 && angDist < 0.36;

      let bumpVal = 115;
      let roughVal = 185; // ~0.72 matte slate

      if (isLatLine || isLonLine) {
        r += 16;
        g += 22;
        b += 30;
        bumpVal = 142;
        roughVal = 130;
      }

      if (isClubRing) {
        r = r * 0.75 + club.rgb[0] * 0.25;
        g = g * 0.75 + club.rgb[1] * 0.25;
        b = b * 0.75 + club.rgb[2] * 0.25;
        bumpVal = 152;
        roughVal = 110;
      }

      // Segregated Voronoi boundary seam between club territories
      if (borderDelta < 0.011 && !isPolarCap) {
        const seamGlow = 1.0 - borderDelta / 0.011;
        // Brushed warm-gold / platinum seam with subtle club tint
        r = r * (1 - seamGlow * 0.85) + 195 * seamGlow * 0.85;
        g = g * (1 - seamGlow * 0.85) + 172 * seamGlow * 0.85;
        b = b * (1 - seamGlow * 0.85) + 118 * seamGlow * 0.85;
        bumpVal = Math.round(160 + seamGlow * 90);
        roughVal = Math.round(110 - seamGlow * 65);
      }

      // Polar astrolabe crown brass cap shading
      if (isPolarCap) {
        const capBlend = Math.min(1, (latDeg - 66) / 6);
        r = r * (1 - capBlend) + 22 * capBlend;
        g = g * (1 - capBlend) + 27 * capBlend;
        b = b * (1 - capBlend) + 36 * capBlend;
        roughVal = Math.round(roughVal * (1 - capBlend) + 95 * capBlend);
      }

      const idx = (py * width + px) * 4;
      aData[idx] = Math.min(255, Math.max(0, Math.round(r)));
      aData[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      aData[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      aData[idx + 3] = 255;

      bData[idx] = bumpVal;
      bData[idx + 1] = bumpVal;
      bData[idx + 2] = bumpVal;
      bData[idx + 3] = 255;

      rData[idx] = roughVal;
      rData[idx + 1] = roughVal;
      rData[idx + 2] = roughVal;
      rData[idx + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedoImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.anisotropy = maxAnisotropy;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.ClampToEdgeWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;

  return { albedoMap, bumpMap, roughnessMap };
}

/**
 * Generates crisp procedural heraldic shield/medallion CanvasTexture for a Premier League club.
 */
function createClubCrestTexture(
  club: ClubSector,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;

  // Dark metallic surround
  ctx.fillStyle = '#0f1623';
  ctx.fillRect(0, 0, size, size);

  // Clip to circular medallion
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Base primary fill
  ctx.fillStyle = club.primaryColor;
  ctx.fillRect(0, 0, size, size);

  // Heraldry pattern
  ctx.fillStyle = club.secondaryColor;
  if (club.heraldry === 'halves') {
    ctx.fillRect(cx, 0, cx, size);
  } else if (club.heraldry === 'stripes') {
    for (let x = 0; x < size; x += 42) {
      ctx.fillRect(x, 0, 20, size);
    }
  } else if (club.heraldry === 'sash') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillRect(-size, -26, size * 2, 52);
    ctx.restore();
  } else if (club.heraldry === 'chevron') {
    ctx.beginPath();
    ctx.moveTo(0, cy - 30);
    ctx.lineTo(cx, cy + 32);
    ctx.lineTo(size, cy - 30);
    ctx.lineTo(size, cy + 16);
    ctx.lineTo(cx, cy + 78);
    ctx.lineTo(0, cy + 16);
    ctx.closePath();
    ctx.fill();
  } else if (club.heraldry === 'hoops') {
    for (let y = 0; y < size; y += 44) {
      ctx.fillRect(0, y, size, 22);
    }
  }

  // Dark center band for crisp monogram contrast
  ctx.fillStyle = 'rgba(8, 12, 20, 0.78)';
  ctx.fillRect(0, cy - 44, size, 88);

  // Subtle top & bottom brass trim lines on band
  ctx.fillStyle = club.accentColor;
  ctx.fillRect(0, cy - 45, size, 3);
  ctx.fillRect(0, cy + 42, size, 3);

  // Club 3-letter code
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 62px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(club.code, cx, cy + 3);

  ctx.restore();

  // Outer brass bezel ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#d4b26a';
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Generates an engraved brass degree & sector tick strip for the outer astrolabe ring.
 */
function createDegreeRingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const width = 1024;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#4f4024');
  grad.addColorStop(0.5, '#b89652');
  grad.addColorStop(1, '#4f4024');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(12, 16, 24, 0.8)';
  ctx.fillStyle = 'rgba(12, 16, 24, 0.9)';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';

  for (let deg = 0; deg < 360; deg += 5) {
    const x = (deg / 360) * width;
    const isMajor = deg % 30 === 0;
    const isMid = deg % 15 === 0;
    const tickH = isMajor ? 34 : isMid ? 22 : 12;

    ctx.lineWidth = isMajor ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, tickH);
    ctx.moveTo(x, height);
    ctx.lineTo(x, height - tickH);
    ctx.stroke();

    if (isMajor) {
      ctx.fillText(`${deg}°`, x, height / 2 + 6);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Soft radial contact shadow beneath the astrolabe assembly.
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, size * 0.04, cx, cx, size * 0.5);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  grad.addColorStop(0.45, 'rgba(2, 6, 14, 0.34)');
  grad.addColorStop(0.8, 'rgba(2, 6, 14, 0.08)');
  grad.addColorStop(1, 'rgba(2, 6, 14, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export function createGlobeTextures(
  clubs: ClubSector[],
  maxAnisotropy: number
): GlobeTextureSet {
  const { albedoMap, bumpMap, roughnessMap } = createVoronoiGlobeTextures(
    clubs,
    maxAnisotropy
  );
  const degreeRingMap = createDegreeRingTexture(maxAnisotropy);
  const contactShadowMap = createContactShadowTexture();
  const crestMaps = new Map<string, THREE.CanvasTexture>();

  for (const club of clubs) {
    crestMaps.set(club.id, createClubCrestTexture(club, maxAnisotropy));
  }

  return {
    albedoMap,
    bumpMap,
    roughnessMap,
    degreeRingMap,
    contactShadowMap,
    crestMaps,
    dispose: () => {
      albedoMap.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
      degreeRingMap.dispose();
      contactShadowMap.dispose();
      crestMaps.forEach((tex) => tex.dispose());
    },
  };
}
