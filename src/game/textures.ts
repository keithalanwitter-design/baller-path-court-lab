import type { Scene } from "@babylonjs/core/scene";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

/**
 * Procedural textures — everything is painted on canvases at load time so the
 * game ships with zero image assets and stays tiny.
 */

export const PALETTE = {
  navyDeep: "#071428",
  navy: "#0B1F3A",
  navyMid: "#12305a",
  orange: "#FF6A2B",
  orangeHot: "#FF8A3D",
  softBlue: "#5BB8F0",
  violet: "#AD78FF",
  white: "#F4F7FF",
};

type Ctx = CanvasRenderingContext2D;

/** Seeded RNG so the floor looks identical every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FloorSpec = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  halfW: number;
  midcourtZ: number;
  baselineZ: number;
  rimZ: number;
  freeThrowZ: number;
  paintHalfW: number;
  threePtR: number;
};

/**
 * Full hardwood court: maple planks, navy painted key + apron, white lines,
 * orange Baller Path centre logo and baseline wordmark.
 * Canvas top = far (+Z) end of the floor, canvas left = -X.
 */
export function createCourtTexture(scene: Scene, f: FloorSpec) {
  const W = 2048;
  const worldW = f.maxX - f.minX;
  const worldD = f.maxZ - f.minZ;
  const H = Math.round((W * worldD) / worldW);
  const ppu = W / worldW; // pixels per world unit
  const tex = new DynamicTexture("court-floor-tex", { width: W, height: H }, scene, true);
  const ctx = tex.getContext() as Ctx;
  const rand = rng(23);

  const px = (x: number) => (x - f.minX) * ppu;
  const pz = (z: number) => (f.maxZ - z) * ppu;

  // --- Hardwood planks running baseline → midcourt (along Z) ---
  const plankW = 0.11 * ppu;
  for (let x = 0; x < W; x += plankW) {
    let y = -rand() * 400;
    while (y < H) {
      const len = 260 + rand() * 520;
      const tone = rand();
      const r = 188 + tone * 26 - 10;
      const g = 124 + tone * 22 - 8;
      const b = 70 + tone * 16 - 6;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x, y, plankW + 0.5, len);
      // grain streaks
      for (let k = 0; k < 5; k += 1) {
        ctx.fillStyle = `rgba(${90 + rand() * 30},${50 + rand() * 20},20,${0.05 + rand() * 0.08})`;
        const gx = x + rand() * plankW;
        ctx.fillRect(gx, y, 1 + rand() * 1.5, len);
      }
      // board end seam
      ctx.fillStyle = "rgba(60,32,12,0.35)";
      ctx.fillRect(x, y + len - 1, plankW, 1.5);
      y += len;
    }
    // plank gap
    ctx.fillStyle = "rgba(70,38,14,0.28)";
    ctx.fillRect(x, 0, 1, H);
  }

  // Varnish sheen: soft light pool in the middle, darker at the edges.
  const sheen = ctx.createRadialGradient(px(0), pz(1.5), 50, px(0), pz(1.5), W * 0.62);
  sheen.addColorStop(0, "rgba(255,226,180,0.10)");
  sheen.addColorStop(1, "rgba(20,10,0,0.25)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  // --- Navy apron outside the playing area ---
  ctx.fillStyle = "rgba(11,31,58,0.94)";
  ctx.fillRect(0, 0, W, pz(f.baselineZ)); // behind baseline
  ctx.fillRect(0, 0, px(-f.halfW), H); // left
  ctx.fillRect(px(f.halfW), 0, W - px(f.halfW), H); // right

  // Orange pinstripe framing the court
  ctx.strokeStyle = PALETTE.orange;
  ctx.lineWidth = 0.05 * ppu;
  ctx.strokeRect(px(-f.halfW) - 0.28 * ppu, pz(f.baselineZ) - 0.28 * ppu, (f.halfW * 2 + 0.56) * ppu, H);

  // --- Painted key (navy) ---
  ctx.fillStyle = "rgba(14,38,74,0.93)";
  ctx.fillRect(px(-f.paintHalfW), pz(f.baselineZ), f.paintHalfW * 2 * ppu, (f.baselineZ - f.freeThrowZ) * ppu);

  // --- Centre circle (at midcourt) with BP logo ---
  const cx = px(0);
  const cz = pz(f.midcourtZ);
  ctx.fillStyle = "rgba(11,31,58,0.95)";
  ctx.beginPath();
  ctx.arc(cx, cz, 1.8 * ppu, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.orange;
  ctx.lineWidth = 0.08 * ppu;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cz, 0.6 * ppu, 0, Math.PI * 2);
  ctx.stroke();

  // --- Lines ---
  const lw = 0.075 * ppu;
  ctx.strokeStyle = "rgba(246,248,255,0.95)";
  ctx.lineWidth = lw;
  ctx.lineCap = "butt";
  // boundary
  ctx.strokeRect(px(-f.halfW), pz(f.baselineZ), f.halfW * 2 * ppu, (f.baselineZ - f.minZ + 1) * ppu);
  // midcourt line
  ctx.beginPath();
  ctx.moveTo(px(-f.halfW), cz);
  ctx.lineTo(px(f.halfW), cz);
  ctx.stroke();
  // key outline
  ctx.strokeRect(px(-f.paintHalfW), pz(f.baselineZ), f.paintHalfW * 2 * ppu, (f.baselineZ - f.freeThrowZ) * ppu);
  // free-throw circle: solid top half (toward midcourt), dashed inside the key
  ctx.beginPath();
  ctx.arc(px(0), pz(f.freeThrowZ), 1.6 * ppu, 0, Math.PI);
  ctx.stroke();
  ctx.setLineDash([0.3 * ppu, 0.22 * ppu]);
  ctx.beginPath();
  ctx.arc(px(0), pz(f.freeThrowZ), 1.6 * ppu, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // restricted-area arc under the rim
  ctx.beginPath();
  ctx.arc(px(0), pz(f.rimZ), 1.05 * ppu, 0, Math.PI);
  ctx.stroke();
  // lane hash marks
  for (let i = 0; i < 4; i += 1) {
    const hz = f.freeThrowZ + 0.75 + i * 0.72;
    if (hz >= f.baselineZ - 0.3) break;
    ctx.fillStyle = "rgba(246,248,255,0.95)";
    ctx.fillRect(px(-f.paintHalfW) - 0.32 * ppu, pz(hz), 0.32 * ppu, lw);
    ctx.fillRect(px(f.paintHalfW), pz(hz), 0.32 * ppu, lw);
  }
  // three-point line: corner straights + arc around the rim
  const cornerX = Math.min(f.halfW - 1.0, f.threePtR * 0.92);
  const a0 = Math.acos(cornerX / f.threePtR);
  const cornerZ = f.rimZ - Math.sin(a0) * f.threePtR;
  ctx.beginPath();
  ctx.moveTo(px(-cornerX), pz(f.baselineZ));
  ctx.lineTo(px(-cornerX), pz(cornerZ));
  // canvas angles: 0 = +x, PI/2 = +canvas-y (toward -Z). Arc sweeps the midcourt side.
  ctx.arc(px(0), pz(f.rimZ), f.threePtR * ppu, Math.PI - a0, a0, true);
  ctx.lineTo(px(cornerX), pz(f.baselineZ));
  ctx.stroke();

  // --- Centre logo ---
  ctx.save();
  ctx.translate(cx, cz);
  ctx.fillStyle = PALETTE.orange;
  ctx.font = `900 ${0.95 * ppu}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BP", 0, -0.95 * ppu);
  ctx.restore();

  // --- Baseline apron wordmark ---
  ctx.fillStyle = "rgba(244,247,255,0.9)";
  ctx.font = `800 ${0.62 * ppu}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const wy = pz(f.baselineZ + 0.95);
  ctx.fillText("BALLER", px(-4.6), wy);
  ctx.fillStyle = PALETTE.orange;
  ctx.fillText("PATH", px(4.6), wy);

  // Sideline apron wordmarks (rotated)
  ctx.font = `800 ${0.42 * ppu}px "Arial Black", Arial, sans-serif`;
  [-1, 1].forEach((side) => {
    ctx.save();
    ctx.translate(px(side * (f.halfW + 0.75)), pz(0.6));
    ctx.rotate((side * Math.PI) / 2);
    ctx.fillStyle = "rgba(244,247,255,0.55)";
    ctx.fillText("COURT  LAB", 0, 0);
    ctx.restore();
  });

  tex.update(true);
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/** Scrolling LED ribbon board. */
export function createRibbonTexture(scene: Scene) {
  const W = 2048;
  const H = 96;
  const tex = new DynamicTexture("ribbon-tex", { width: W, height: H }, scene, true);
  const ctx = tex.getContext() as Ctx;
  ctx.fillStyle = "#03070f";
  ctx.fillRect(0, 0, W, H);
  const items = [
    ["BALLER PATH", PALETTE.orange],
    ["◆", PALETTE.softBlue],
    ["COURT LAB", PALETTE.white],
    ["◆", PALETTE.softBlue],
    ["PUT IN THE REPS", PALETTE.orange],
    ["◆", PALETTE.softBlue],
    ["FIND YOUR NEXT GEAR", PALETTE.white],
    ["◆", PALETTE.softBlue],
  ] as const;
  ctx.font = `900 58px "Arial Black", Arial, sans-serif`;
  ctx.textBaseline = "middle";
  let x = 30;
  let i = 0;
  while (x < W) {
    const [text, color] = items[i % items.length];
    ctx.fillStyle = color;
    ctx.fillText(text, x, H / 2 + 3);
    x += ctx.measureText(text).width + 44;
    i += 1;
  }
  // LED dot-matrix mask
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.4);
  for (let xx = 0; xx < W; xx += 4) ctx.fillRect(xx, 0, 1.4, H);
  tex.update(true);
  tex.wrapU = 1; // WRAP
  return tex;
}

/** Jersey back: name + number, readable from the broadcast camera. */
export function createJerseyBackTexture(scene: Scene) {
  const S = 256;
  const tex = new DynamicTexture("jersey-back-tex", { width: S, height: S }, scene, true);
  const ctx = tex.getContext() as Ctx;
  ctx.clearRect(0, 0, S, S);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 34px "Arial Black", Arial, sans-serif`;
  ctx.fillStyle = PALETTE.white;
  ctx.fillText("BALLER", S / 2, 40);
  ctx.font = `900 150px "Arial Black", Arial, sans-serif`;
  ctx.lineWidth = 14;
  ctx.strokeStyle = PALETTE.orange;
  ctx.strokeText("23", S / 2, 150);
  ctx.fillStyle = PALETTE.white;
  ctx.fillText("23", S / 2, 150);
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

/** Leather pebble albedo with baked micro-shading. */
export function createPebbleTexture(scene: Scene) {
  const size = 512;
  const tex = new DynamicTexture("ball-pebble", { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as Ctx;
  const rand = rng(7);
  ctx.fillStyle = "#e8631a";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 42000; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = 0.55 + rand() * 0.45;
    ctx.fillStyle = `rgba(${(230 * shade + 25) | 0},${(92 * shade + 10) | 0},${(22 * shade) | 0},${0.35 + rand() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + rand() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = `rgba(60,20,4,${0.1 + rand() * 0.22})`;
    ctx.fillRect(rand() * size, rand() * size, 1.2, 1.2);
  }
  tex.update(true);
  return tex;
}

/** Soft round glow used by sparks, dust and haze. */
export function createSoftDotTexture(scene: Scene, name: string, inner = "rgba(255,255,255,1)", mid = "rgba(255,200,120,0.8)") {
  const size = 64;
  const tex = new DynamicTexture(name, size, scene, false);
  const ctx = tex.getContext() as Ctx;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Hard-edged white square for confetti (tinted by particle color). */
export function createConfettiTexture(scene: Scene) {
  const size = 32;
  const tex = new DynamicTexture("confetti-tex", size, scene, false);
  const ctx = tex.getContext() as Ctx;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#fff";
  ctx.fillRect(6, 10, 20, 12);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Vertical fade for fake volumetric light cones / badge beams. */
export function createBeamTexture(scene: Scene, name: string, fadeBothEnds = false) {
  const W = 8;
  const H = 256;
  const tex = new DynamicTexture(name, { width: W, height: H }, scene, false);
  const ctx = tex.getContext() as Ctx;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (fadeBothEnds) {
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.3, "rgba(255,255,255,0.7)");
    g.addColorStop(0.6, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.5, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Badge token face: coloured hex medal with an icon glyph. */
export function createBadgeFaceTexture(scene: Scene, label: string, glyph: string, color: string) {
  const S = 256;
  const tex = new DynamicTexture(`badge-face-${label}`, { width: S, height: S }, scene, true);
  const ctx = tex.getContext() as Ctx;
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.35, color);
  g.addColorStop(1, PALETTE.navy);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = PALETTE.navyDeep;
  ctx.font = `900 118px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, S / 2, S / 2 + 6);
  tex.update(true);
  return tex;
}

/** Billboard label pill above each badge. */
export function createLabelTexture(scene: Scene, text: string, color: string) {
  const W = 384;
  const H = 96;
  const tex = new DynamicTexture(`label-${text}`, { width: W, height: H }, scene, true);
  const ctx = tex.getContext() as Ctx;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(7,20,40,0.88)";
  const r = 40;
  ctx.beginPath();
  ctx.moveTo(r, 8);
  ctx.arcTo(W - 8, 8, W - 8, H - 8, r);
  ctx.arcTo(W - 8, H - 8, 8, H - 8, r);
  ctx.arcTo(8, H - 8, 8, 8, r);
  ctx.arcTo(8, 8, W - 8, 8, r);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `900 44px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2 + 3);
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

/** Hanging arena scoreboard, redrawn when score/time changes. */
export function drawScoreboard(tex: DynamicTexture, score: number, time: number, combo: number, flash: string | null) {
  const ctx = tex.getContext() as Ctx;
  const { width: W, height: H } = tex.getSize();
  ctx.fillStyle = "#02060d";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.orange;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (flash) {
    ctx.fillStyle = PALETTE.orange;
    ctx.font = `900 150px "Arial Black", Arial, sans-serif`;
    ctx.fillText(flash, W / 2, H / 2 + 8);
  } else {
    ctx.font = `800 40px "Arial Black", Arial, sans-serif`;
    ctx.fillStyle = "rgba(184,210,229,0.8)";
    ctx.fillText("SCORE", W * 0.22, 56);
    ctx.fillText("TIME", W * 0.5, 56);
    ctx.fillText("COMBO", W * 0.78, 56);
    ctx.font = `900 120px "Courier New", monospace`;
    ctx.fillStyle = PALETTE.orange;
    ctx.fillText(String(score).padStart(4, "0"), W * 0.22, H * 0.62);
    ctx.fillStyle = time < 10 ? "#ff5b6b" : PALETTE.white;
    ctx.fillText(String(Math.ceil(time)).padStart(2, "0"), W * 0.5, H * 0.62);
    ctx.fillStyle = PALETTE.softBlue;
    ctx.fillText(`x${combo}`, W * 0.78, H * 0.62);
  }
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 1.5);
  tex.update(true);
}
