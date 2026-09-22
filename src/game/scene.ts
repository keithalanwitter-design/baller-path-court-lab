import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TrailMesh } from "@babylonjs/core/Meshes/trailMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import "@babylonjs/core/Particles/particleSystemComponent";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import "@babylonjs/core/Layers/effectLayerSceneComponent";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { Sfx } from "./audio";
import { createPlayer, toonMaterial } from "./player";
import {
  createBadgeFaceTexture,
  createBeamTexture,
  createConfettiTexture,
  createCourtTexture,
  createJerseyBackTexture,
  createLabelTexture,
  createPebbleTexture,
  createRibbonTexture,
  createSoftDotTexture,
  drawScoreboard,
} from "./textures";

export type BadgeKind = "SPEED" | "FOCUS" | "FLOW";
export type GameMode = "ready" | "playing" | "complete";
export type Tone = "cyan" | "orange" | "violet" | "muted";

export type GameEvent = { id: number; title: string; sub: string; tone: Tone; big: boolean };

export type GameState = {
  mode: GameMode;
  tutorialStep: 0 | 1 | 2 | 3 | 4;
  timeLeft: number;
  score: number;
  combo: number;
  badges: BadgeKind[];
  hasBall: boolean;
  message: string;
  messageTone: Tone;
  charging: boolean;
  charge: number;
  sweetSpotMin: number;
  sweetSpotMax: number;
  perfectMin: number;
  perfectMax: number;
  shots: number;
  makes: number;
  perfects: number;
  bestCombo: number;
  best: number;
  newBest: boolean;
  onFire: boolean;
  muted: boolean;
  event: GameEvent | null;
};

export type GameHandle = {
  scene: Scene;
  dispose: () => void;
  restart: () => void;
  onState: (listener: (next: GameState) => void) => () => void;
  /** Virtual joystick input, x/z in [-1, 1] (z+ = toward the rim). */
  setMove: (x: number, z: number) => void;
  shootDown: () => void;
  shootUp: () => void;
  setMuted: (muted: boolean) => void;
};

// ---------------------------------------------------------------------------
// Tuning — shot feel is intentionally unchanged from the original build.
// ---------------------------------------------------------------------------
const SWEET_MIN = 0.52;
const SWEET_MAX = 0.78;
const PERFECT_MIN = 0.6;
const PERFECT_MAX = 0.7;
const CHARGE_RATE = 0.78; // ~1.28s to full
const OVERCHARGE_GRACE = 0.12;
const DEFAULT_SESSION_SECONDS = 45;
const FIRE_COMBO = 3;
const BALL_R = 0.275;
const GRAVITY = -13;

const COURT = {
  halfW: 9.0,
  midcourtZ: -5.6,
  baselineZ: 6.5,
  rimZ: 5.55,
  rimY: 2.62,
  freeThrowZ: 2.7,
  paintHalfW: 2.4,
  threePtR: 6.4,
};
const FLOOR = { minX: -12.5, maxX: 12.5, minZ: -9, maxZ: 9 };

const COLORS = {
  navyDeep: new Color3(0.027, 0.078, 0.157),
  navy: new Color3(0.043, 0.122, 0.227),
  orange: new Color3(1, 0.42, 0.12),
  orangeHot: new Color3(1, 0.52, 0.12),
  softBlue: new Color3(0.36, 0.72, 0.94),
  violet: new Color3(0.68, 0.47, 1),
  white: new Color3(0.95, 0.97, 1),
  steel: new Color3(0.42, 0.47, 0.56),
};

const BADGES: Array<{ kind: BadgeKind; position: Vector3; color: Color3; hex: string; glyph: string }> = [
  { kind: "SPEED", position: new Vector3(-6.4, 1.05, 1.8), color: COLORS.softBlue, hex: "#5BB8F0", glyph: "»" },
  { kind: "FOCUS", position: new Vector3(0.6, 1.05, -2.4), color: COLORS.orange, hex: "#FF6A2B", glyph: "◎" },
  { kind: "FLOW", position: new Vector3(6.2, 1.05, 2.1), color: COLORS.violet, hex: "#AD78FF", glyph: "∿" },
];

const BEST_KEY = "bpq-best-score";
const MUTE_KEY = "bpq-muted";
const readStore = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeStore = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* storage unavailable — fine */
  }
};

function unlit(scene: Scene, name: string, color: Color3, alpha = 1, additive = false) {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = color;
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  if (alpha < 1 || additive) {
    m.alpha = alpha;
    m.transparencyMode = Material.MATERIAL_ALPHABLEND;
  }
  if (additive) m.alphaMode = Engine.ALPHA_ADD;
  return m;
}

function lit(scene: Scene, name: string, color: Color3, emissive = 0.08, spec = 0) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.emissiveColor = color.scale(emissive);
  m.specularColor = new Color3(spec, spec, spec);
  return m;
}

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.012, 0.03, 0.065, 1);
  scene.ambientColor = new Color3(0.2, 0.2, 0.24);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.012;
  scene.fogColor = new Color3(0.02, 0.045, 0.09);

  const params = new URLSearchParams(window.location.search);
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const low = params.get("quality") === "low" || (params.get("quality") !== "high" && coarse);
  if (low) engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 2));

  // Demo-only: shorter session for automated screenshots (?demo&secs=12)
  const SESSION_SECONDS = params.has("demo") && params.get("secs") ? Math.max(5, Number(params.get("secs")) || DEFAULT_SESSION_SECONDS) : DEFAULT_SESSION_SECONDS;

  const sfx = new Sfx();
  sfx.muted = readStore(MUTE_KEY) === "1";

  // ---------------------------------------------------------------- camera
  const CAM = { alpha: -Math.PI / 2 + 0.22, beta: 1.3, radius: 17.2, target: new Vector3(0, 1.7, 2.4) };
  const camera = new ArcRotateCamera("court-camera", CAM.alpha, CAM.beta, CAM.radius, CAM.target.clone(), scene);
  camera.fov = 0.78;
  camera.minZ = 0.2;
  camera.maxZ = 120;

  // ---------------------------------------------------------------- lights
  const hemi = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.5;
  hemi.diffuse = new Color3(0.78, 0.84, 1);
  hemi.groundColor = new Color3(0.12, 0.08, 0.06);
  hemi.specular = Color3.Black();

  const key = new DirectionalLight("key", new Vector3(-0.28, -1, 0.42), scene);
  key.position = new Vector3(6, 18, -9);
  key.intensity = 1.45;
  key.diffuse = new Color3(1, 0.93, 0.82);
  key.specular = new Color3(0.9, 0.8, 0.65);

  const rimLight = new PointLight("rim-light", new Vector3(0, 3.6, COURT.rimZ - 0.6), scene);
  rimLight.diffuse = COLORS.orangeHot;
  rimLight.specular = Color3.Black();
  rimLight.intensity = 0.9;
  rimLight.range = 9;

  const bounce = new PointLight("court-bounce", new Vector3(0, 0.6, 0.5), scene);
  bounce.diffuse = new Color3(1, 0.72, 0.45);
  bounce.specular = Color3.Black();
  bounce.intensity = 0.35;
  bounce.range = 14;

  const shadows = new ShadowGenerator(low ? 1024 : 2048, key);
  shadows.usePercentageCloserFiltering = !low;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.004;
  shadows.darkness = 0.35;
  key.shadowMinZ = 1;
  key.shadowMaxZ = 45;
  key.autoUpdateExtends = true;

  // ---------------------------------------------------------------- floor
  const floorW = FLOOR.maxX - FLOOR.minX;
  const floorD = FLOOR.maxZ - FLOOR.minZ;
  const floor = MeshBuilder.CreateGround("court", { width: floorW, height: floorD }, scene);
  floor.position = new Vector3((FLOOR.minX + FLOOR.maxX) / 2, 0, (FLOOR.minZ + FLOOR.maxZ) / 2);
  const courtTex = createCourtTexture(scene, { ...FLOOR, ...COURT });
  const floorMat = new StandardMaterial("court-mat", scene);
  floorMat.diffuseTexture = courtTex;
  floorMat.emissiveTexture = courtTex;
  floorMat.emissiveColor = new Color3(0.16, 0.16, 0.18);
  floorMat.specularColor = new Color3(0.32, 0.28, 0.22);
  floorMat.specularPower = 80;
  floorMat.maxSimultaneousLights = 6;
  floor.material = floorMat;
  floor.receiveShadows = true;

  // Glossy hardwood reflection
  let mirror: MirrorTexture | null = null;
  if (!low) try {
    mirror = new MirrorTexture("floor-mirror", { ratio: 0.5 }, scene, true);
    mirror.mirrorPlane = new Plane(0, -1, 0, 0);
    mirror.level = 0.22;
    mirror.adaptiveBlurKernel = 20;
    floorMat.reflectionTexture = mirror;
  } catch {
    mirror = null;
  }
  const reflect = (...ms: Mesh[]) => {
    if (mirror) mirror.renderList!.push(...ms);
  };

  // Dark surround beyond the floor
  const surround = MeshBuilder.CreateGround("surround", { width: 90, height: 90 }, scene);
  surround.position.y = -0.02;
  surround.material = lit(scene, "surround-mat", new Color3(0.03, 0.06, 0.11), 0.2);

  // ---------------------------------------------------------------- arena
  const arena = buildArena(scene, reflect, low);

  // ---------------------------------------------------------------- hoop
  const hoop = buildHoop(scene, shadows, reflect);

  // ---------------------------------------------------------------- player + ball
  const rig = createPlayer(scene, createJerseyBackTexture(scene));
  rig.meshes.forEach((m) => shadows.addShadowCaster(m));
  reflect(...rig.meshes);

  const ball = MeshBuilder.CreateSphere("ball", { diameter: BALL_R * 2, segments: 40 }, scene);
  const ballMat = new StandardMaterial("ball-mat", scene);
  const pebble = createPebbleTexture(scene);
  ballMat.diffuseTexture = pebble;
  ballMat.emissiveColor = new Color3(0.3, 0.1, 0.02);
  ballMat.specularColor = new Color3(0.5, 0.28, 0.1);
  ballMat.specularPower = 48;
  ball.material = ballMat;
  const seamMat = unlit(scene, "ball-seam", new Color3(0.06, 0.03, 0.02));
  [
    [Math.PI / 2, 0, 0],
    [0, 0, 0],
    [0.62, Math.PI / 2, 0],
    [-0.62, Math.PI / 2, 0],
  ].forEach((rot, i) => {
    const seam = MeshBuilder.CreateTorus(`ball-seam-${i}`, { diameter: BALL_R * 2 * (i > 1 ? 0.93 : 1.0), thickness: 0.022, tessellation: 48 }, scene);
    seam.rotation.set(rot[0], rot[1], rot[2]);
    seam.material = seamMat;
    seam.parent = ball;
  });
  shadows.addShadowCaster(ball, true);
  reflect(ball);
  ball.rotationQuaternion = Quaternion.Identity();

  const ballShadow = MeshBuilder.CreateDisc("ball-contact", { radius: BALL_R * 1.2, tessellation: 24 }, scene);
  ballShadow.rotation.x = Math.PI / 2;
  ballShadow.material = unlit(scene, "ball-contact-mat", new Color3(0.01, 0.015, 0.03), 0.45);

  // ---------------------------------------------------------------- badges
  const beamTex = createBeamTexture(scene, "badge-beam-tex");
  const dotTex = createSoftDotTexture(scene, "dot-tex");
  const badges = BADGES.map((b) => {
    const node = new TransformNode(`badge-${b.kind}`, scene);
    node.position = b.position.clone();
    const ring = MeshBuilder.CreateTorus(`badge-ring-${b.kind}`, { diameter: 0.86, thickness: 0.11, tessellation: 6 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.y = Math.PI / 6;
    ring.parent = node;
    ring.material = unlit(scene, `badge-ring-mat-${b.kind}`, b.color);
    const faceMat = new StandardMaterial(`badge-face-mat-${b.kind}`, scene);
    const faceTex = createBadgeFaceTexture(scene, b.kind, b.glyph, b.hex);
    faceMat.diffuseTexture = faceTex;
    faceMat.emissiveTexture = faceTex;
    faceMat.disableLighting = true;
    faceMat.backFaceCulling = false;
    const face = MeshBuilder.CreateDisc(`badge-face-${b.kind}`, { radius: 0.37, tessellation: 6, sideOrientation: Mesh.DOUBLESIDE }, scene);
    face.rotation.z = Math.PI / 6;
    face.parent = node;
    face.material = faceMat;

    const beam = MeshBuilder.CreateCylinder(`badge-beam-${b.kind}`, { height: 5, diameterTop: 0.5, diameterBottom: 1.1, tessellation: 24, cap: Mesh.NO_CAP }, scene);
    beam.position = new Vector3(b.position.x, 2.5, b.position.z);
    const beamMat = unlit(scene, `badge-beam-mat-${b.kind}`, b.color, 0.28, true);
    beamMat.opacityTexture = beamTex;
    beamMat.backFaceCulling = false;
    beam.material = beamMat;
    beam.rotation.x = Math.PI; // bright end at the floor

    const pad = MeshBuilder.CreateDisc(`badge-pad-${b.kind}`, { radius: 1.1, tessellation: 40 }, scene);
    pad.rotation.x = Math.PI / 2;
    pad.position = new Vector3(b.position.x, 0.03, b.position.z);
    const padMat = unlit(scene, `badge-pad-mat-${b.kind}`, b.color, 0.75, true);
    padMat.opacityTexture = dotTex;
    pad.material = padMat;

    const label = MeshBuilder.CreatePlane(`badge-label-${b.kind}`, { width: 1.5, height: 0.375 }, scene);
    label.position = new Vector3(b.position.x, b.position.y + 0.82, b.position.z);
    label.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const labelMat = new StandardMaterial(`badge-label-mat-${b.kind}`, scene);
    const labelTex = createLabelTexture(scene, b.kind, b.hex);
    labelMat.diffuseTexture = labelTex;
    labelMat.emissiveTexture = labelTex;
    labelMat.opacityTexture = labelTex;
    labelMat.disableLighting = true;
    label.material = labelMat;

    arena.glow.addIncludedOnlyMesh(ring);
    arena.glow.addIncludedOnlyMesh(face);
    reflect(ring, face);
    return { ...b, node, ring, face, beam, pad, label, collected: false, collectT: 0 };
  });

  // ---------------------------------------------------------------- FX
  const sparkTex = createSoftDotTexture(scene, "spark-tex", "rgba(255,255,255,1)", "rgba(255,190,110,0.85)");
  const makeSparks = burst(scene, "make-sparks", 160, sparkTex, new Color4(1, 0.7, 0.25, 1), new Color4(1, 0.4, 0.08, 1), {
    size: [0.05, 0.14],
    life: [0.25, 0.55],
    power: [2.4, 5.2],
    gravity: -7,
    additive: true,
  });
  const confetti = burst(scene, "confetti", 220, createConfettiTexture(scene), new Color4(1, 0.45, 0.15, 1), new Color4(0.36, 0.72, 0.94, 1), {
    size: [0.08, 0.16],
    life: [1.0, 1.8],
    power: [3, 6.5],
    gravity: -4,
    additive: false,
  });
  confetti.addColorGradient(0, new Color4(1, 0.45, 0.15, 1), new Color4(0.95, 0.97, 1, 1));
  confetti.addColorGradient(1, new Color4(0.36, 0.72, 0.94, 0.9), new Color4(0.68, 0.47, 1, 0.9));
  confetti.minAngularSpeed = -8;
  confetti.maxAngularSpeed = 8;
  const dust = burst(scene, "miss-dust", 60, dotTex, new Color4(0.7, 0.72, 0.78, 0.5), new Color4(0.45, 0.47, 0.52, 0.35), {
    size: [0.1, 0.26],
    life: [0.3, 0.6],
    power: [0.6, 1.8],
    gravity: -2,
    additive: false,
  });
  const pickup = burst(scene, "badge-pickup", 90, sparkTex, new Color4(1, 1, 1, 1), new Color4(1, 1, 1, 1), {
    size: [0.06, 0.16],
    life: [0.3, 0.7],
    power: [1.8, 4.2],
    gravity: -3,
    additive: true,
  });

  // "On fire" flames trailing the ball once the combo heats up
  const fire = new ParticleSystem("on-fire", 260, scene);
  fire.particleTexture = sparkTex;
  fire.emitter = ball;
  fire.minEmitBox = new Vector3(-0.12, -0.12, -0.12);
  fire.maxEmitBox = new Vector3(0.12, 0.12, 0.12);
  fire.color1 = new Color4(1, 0.62, 0.15, 1);
  fire.color2 = new Color4(1, 0.3, 0.05, 1);
  fire.colorDead = new Color4(0.3, 0.02, 0, 0);
  fire.minSize = 0.12;
  fire.maxSize = 0.32;
  fire.minLifeTime = 0.18;
  fire.maxLifeTime = 0.38;
  fire.emitRate = 0;
  fire.blendMode = ParticleSystem.BLENDMODE_ADD;
  fire.gravity = new Vector3(0, 3.2, 0);
  fire.direction1 = new Vector3(-0.3, 0.6, -0.3);
  fire.direction2 = new Vector3(0.3, 1.2, 0.3);
  fire.minEmitPower = 0.3;
  fire.maxEmitPower = 0.9;
  fire.start();

  // Rim target ring shown while charging / in flight
  const targetGlow = MeshBuilder.CreateTorus("rim-target", { diameter: 1.45, thickness: 0.05, tessellation: 48 }, scene);
  targetGlow.position = new Vector3(0, COURT.rimY + 0.01, COURT.rimZ);
  const targetMat = unlit(scene, "rim-target-mat", COLORS.orange, 0.85, true);
  targetGlow.material = targetMat;
  targetGlow.setEnabled(false);
  arena.glow.addIncludedOnlyMesh(targetGlow);

  // ---------------------------------------------------------------- post
  let pipeline: DefaultRenderingPipeline | null = null;
  try {
    pipeline = new DefaultRenderingPipeline("bpq-post", true, scene, [camera]);
    pipeline.samples = low ? 1 : 4;
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.82;
    pipeline.bloomWeight = 0.28;
    pipeline.bloomKernel = 48;
    pipeline.bloomScale = 0.5;
    pipeline.imageProcessingEnabled = true;
    const ip = pipeline.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.25;
    ip.contrast = 1.18;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.2;
    ip.vignetteStretch = 0.4;
    ip.vignetteColor = new Color4(0.01, 0.03, 0.08, 0);
    pipeline.chromaticAberrationEnabled = false;
  } catch {
    pipeline = null;
  }

  // ---------------------------------------------------------------- state
  const initialBest = Number(readStore(BEST_KEY) ?? 0) || 0;
  const state: GameState = {
    mode: "ready",
    tutorialStep: 0,
    timeLeft: SESSION_SECONDS,
    score: 0,
    combo: 0,
    badges: [],
    hasBall: true,
    message: coarse ? "Use the stick to move. Collect 3 badges, then hold SHOOT." : "Move with WASD. Collect the 3 badges, then hold SPACE to shoot.",
    messageTone: "orange",
    charging: false,
    charge: 0,
    sweetSpotMin: SWEET_MIN,
    sweetSpotMax: SWEET_MAX,
    perfectMin: PERFECT_MIN,
    perfectMax: PERFECT_MAX,
    shots: 0,
    makes: 0,
    perfects: 0,
    bestCombo: 0,
    best: initialBest,
    newBest: false,
    onFire: false,
    muted: sfx.muted,
    event: null,
  };

  const listeners = new Set<(next: GameState) => void>();
  let lastKey = "";
  const snapshot = (): GameState => ({ ...state, badges: [...state.badges], charge: Math.round(state.charge * 1000) / 1000 });
  const emit = (force = false) => {
    const k = [
      state.mode,
      state.tutorialStep,
      Math.ceil(state.timeLeft),
      state.score,
      state.combo,
      state.badges.length,
      state.hasBall,
      state.message,
      state.charging,
      Math.round(state.charge * 60),
      state.event?.id ?? 0,
      state.muted,
      state.onFire,
      state.best,
    ].join("|");
    if (!force && k === lastKey) return;
    lastKey = k;
    const snap = snapshot();
    listeners.forEach((l) => l(snap));
  };
  let eventId = 0;
  const pushEvent = (title: string, sub: string, tone: Tone, big = false) => {
    eventId += 1;
    state.event = { id: eventId, title, sub, tone, big };
  };
  const setMessage = (message: string, tone: Tone = "cyan") => {
    state.message = message;
    state.messageTone = tone;
    emit();
  };

  // Scoreboard (diegetic)
  let boardFlash: string | null = null;
  let boardFlashT = 0;
  let boardKey = "";
  const refreshBoard = () => {
    const k = `${state.score}|${Math.ceil(state.timeLeft)}|${state.combo}|${boardFlash}`;
    if (k === boardKey) return;
    boardKey = k;
    drawScoreboard(arena.boardTex, state.score, state.timeLeft, state.combo, boardFlash);
  };
  refreshBoard();

  // ---------------------------------------------------------------- runtime vars
  const keys = new Set<string>();
  const joy = new Vector3();
  const demo = params.has("demo");
  // Demo-only fast-forward (used for automated screenshots on slow renderers)
  const timeScale = demo ? Math.min(6, Math.max(0.25, Number(params.get("speed") ?? 1) || 1)) : 1;
  let elapsed = 0;
  let spaceHeld = false;
  let pointerCharging = false;
  let overchargeTimer = 0;
  let heading = 0;
  let walkPhase = 0;
  let moveAmount = 0;
  let dribblePhase = 0;
  let lastDribbleSign = 1;
  let jumpT = 0;
  let followThroughT = 0;
  let camFx: { kind: "make" | "miss"; t: number } | null = null;
  let netT = 0;
  let cheerT = 0;
  let lastTickSecond = -1;
  let trail: TrailMesh | null = null;

  type Shot = {
    result: "perfect" | "good" | "miss";
    missKind: "short" | "long" | "air" | null;
    phase: "flight" | "loose" | "return";
    t: number;
    dur: number;
    start: Vector3;
    end: Vector3;
    apex: number;
    vel: Vector3;
    bounces: number;
    looseT: number;
    returnFrom: Vector3;
  };
  let shot: Shot | null = null;

  // Demo autopilot
  let demoShotIndex = 0;
  const demoPlan: Array<"perfect" | "good" | "early" | "late" | "airball"> = ["perfect", "good", "perfect", "early", "perfect", "late", "good", "airball"];
  let demoCharging = false;
  let demoReleaseAt = 0.65;

  const anchorWorld = () => {
    rig.root.computeWorldMatrix(true);
    rig.body.computeWorldMatrix(true);
    rig.armR.computeWorldMatrix(true);
    rig.ballAnchor.computeWorldMatrix(true);
    return rig.ballAnchor.getAbsolutePosition().clone();
  };

  const resetCharge = () => {
    if (state.charging) sfx.stopCharge();
    state.charging = false;
    state.charge = 0;
    overchargeTimer = 0;
    demoCharging = false;
  };

  const clearTrail = () => {
    trail?.dispose();
    trail = null;
  };

  const restart = () => {
    sfx.unlock();
    state.mode = "playing";
    state.tutorialStep = 0;
    state.timeLeft = SESSION_SECONDS;
    state.score = 0;
    state.combo = 0;
    state.badges = [];
    state.hasBall = true;
    state.shots = 0;
    state.makes = 0;
    state.perfects = 0;
    state.bestCombo = 0;
    state.newBest = false;
    state.onFire = false;
    state.event = null;
    state.message = coarse ? "Use the left stick. Walk into the glowing badges." : "Move with WASD / arrows. Walk into the glowing badges.";
    state.messageTone = "orange";
    resetCharge();
    rig.root.position.set(0, 0, -3.6);
    heading = 0;
    shot = null;
    clearTrail();
    badges.forEach((b) => {
      b.collected = false;
      b.collectT = 0;
      b.node.setEnabled(true);
      b.node.scaling.setAll(1);
      b.beam.setEnabled(true);
      b.pad.setEnabled(true);
      b.label.setEnabled(true);
    });
    targetGlow.setEnabled(false);
    lastTickSecond = -1;
    emit(true);
  };

  const grade = (charge: number): "perfect" | "good" | "miss" => {
    if (charge >= PERFECT_MIN && charge <= PERFECT_MAX) return "perfect";
    if (charge >= SWEET_MIN && charge <= SWEET_MAX) return "good";
    return "miss";
  };

  const rimCenter = new Vector3(0, COURT.rimY, COURT.rimZ);

  const beginShot = (result: "perfect" | "good" | "miss", fromCharge: number) => {
    if (!state.hasBall || shot) return;
    state.hasBall = false;
    state.shots += 1;
    const start = ball.position.clone();
    let end: Vector3;
    let missKind: Shot["missKind"] = null;
    if (result === "miss") {
      missKind = fromCharge >= 1 ? "air" : fromCharge < SWEET_MIN ? "short" : "long";
      end =
        missKind === "short"
          ? rimCenter.add(new Vector3(0.05, 0.08, -0.6))
          : missKind === "long"
            ? rimCenter.add(new Vector3(-0.08, 0.14, 0.58))
            : rimCenter.add(new Vector3(1.5, -0.7, 0.9));
      setMessage(
        missKind === "air" ? "Airball — don't hold past full." : missKind === "short" ? "Short — let it build to the sweet spot." : "Long — release a touch sooner.",
        "muted",
      );
    } else {
      end = rimCenter.add(new Vector3(0, 0.18, 0));
      setMessage(result === "perfect" ? "Perfect release!" : "Good release!", "orange");
    }
    const dist = Vector3.Distance(start, end);
    shot = {
      result,
      missKind,
      phase: "flight",
      t: 0,
      dur: 0.62 + dist * 0.028,
      start,
      end,
      apex: missKind === "air" ? 1.6 : 2.5 + dist * 0.06,
      vel: new Vector3(),
      bounces: 0,
      looseT: 0,
      returnFrom: new Vector3(),
    };
    jumpT = 0.001;
    followThroughT = 0.55;
    sfx.release();
    clearTrail();
    if (state.onFire) {
      // Comet trail only while on fire — keeps normal shots clean
      trail = new TrailMesh("ball-trail", ball, scene, { diameter: 0.2, length: 18, autoStart: true });
      const trailMat = unlit(scene, "ball-trail-mat", new Color3(1, 0.45, 0.1), 0.45, true);
      trailMat.backFaceCulling = false;
      trail.material = trailMat;
    }
    targetGlow.setEnabled(true);
    emit();
  };

  const startCharge = () => {
    sfx.unlock();
    if (state.mode !== "playing") {
      restart();
      return;
    }
    if (!state.hasBall || shot || state.charging) return;
    if (state.badges.length < 3) {
      setMessage(`Collect ${3 - state.badges.length} more badge${state.badges.length === 2 ? "" : "s"} to unlock your shot.`, "violet");
      return;
    }
    state.charging = true;
    state.charge = 0;
    overchargeTimer = 0;
    state.tutorialStep = Math.max(state.tutorialStep, 3) as GameState["tutorialStep"];
    sfx.startCharge();
    setMessage("Release in the orange band.", "orange");
  };

  const releaseShot = () => {
    if (state.mode !== "playing" || !state.charging || shot) return;
    const charge = state.charge;
    resetCharge();
    beginShot(grade(charge), charge);
  };

  // Resolve the shot the moment the ball reaches the rim.
  const resolveShot = (s: Shot) => {
    const made = s.result !== "miss";
    if (made) {
      state.makes += 1;
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      const perfect = s.result === "perfect";
      if (perfect) state.perfects += 1;
      const wasFire = state.onFire;
      state.onFire = state.combo >= FIRE_COMBO;
      const pts = (perfect ? 350 : 250) + state.combo * 50 + (state.onFire ? 150 : 0);
      state.score += pts;
      state.tutorialStep = 4;
      pushEvent(perfect ? "SPLASH!" : "BUCKET!", `+${pts}${state.combo > 1 ? `  ·  x${state.combo} COMBO` : ""}`, "orange", perfect);
      if (state.onFire && !wasFire) {
        state.message = "You're ON FIRE — bonus points on every make!";
      } else {
        state.message = perfect ? `Perfect release · combo x${state.combo}` : `Good release · combo x${state.combo}`;
      }
      state.messageTone = "orange";
      makeSparks.emitter = rimCenter.clone();
      makeSparks.manualEmitCount = perfect ? 110 : 60;
      if (perfect || state.onFire) {
        confetti.emitter = rimCenter.add(new Vector3(0, 0.4, 0));
        confetti.manualEmitCount = state.onFire ? 200 : 130;
      }
      camFx = { kind: "make", t: 0 };
      netT = 0.55;
      cheerT = perfect ? 1.8 : 1.2;
      boardFlash = perfect ? "SPLASH!" : "BUCKET";
      boardFlashT = 1.4;
      sfx.swish();
      sfx.crowd(perfect || state.onFire);
      // Drop through the net
      s.vel = new Vector3(0, -2.2, 0);
    } else {
      state.combo = 0;
      state.onFire = false;
      pushEvent(s.missKind === "air" ? "AIRBALL" : "BRICK", s.missKind === "short" ? "TOO EARLY" : s.missKind === "long" ? "TOO LATE" : "HELD TOO LONG", "muted");
      camFx = { kind: "miss", t: 0 };
      if (s.missKind === "air") {
        sfx.groan();
        s.vel = new Vector3(1.6, -3, 1.6);
      } else {
        sfx.rim();
        dust.emitter = ball.position.clone();
        dust.manualEmitCount = 24;
        const side = Math.random() < 0.5 ? -1 : 1;
        s.vel = s.missKind === "short" ? new Vector3(side * 1.2, 3.4, -3.2) : new Vector3(side * 1.6, 3.8, -2.6);
      }
    }
    emit(true);
  };

  // ---------------------------------------------------------------- input
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    keys.add(k);
    if (e.code === "Space") {
      if (!spaceHeld) {
        spaceHeld = true;
        if (!demo) startCharge();
      }
    }
    if (k === "r" && state.mode !== "ready") restart();
    if (k === "m") setMuted(!state.muted);
    if (k === "enter" && state.mode !== "playing") restart();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
    if (e.code === "Space") {
      spaceHeld = false;
      if (!demo) releaseShot();
    }
  };
  const onPointerDown = (e: PointerEvent) => {
    if (demo || e.pointerType !== "mouse" || e.button !== 0) return;
    pointerCharging = true;
    startCharge();
  };
  const onPointerUp = () => {
    if (demo || !pointerCharging) return;
    pointerCharging = false;
    releaseShot();
  };
  const onBlur = () => {
    keys.clear();
    joy.setAll(0);
    if (state.charging) resetCharge();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  const setMuted = (muted: boolean) => {
    state.muted = muted;
    sfx.setMuted(muted);
    writeStore(MUTE_KEY, muted ? "1" : "0");
    emit(true);
  };

  if (demo) restart();

  // ---------------------------------------------------------------- helpers
  const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
  const ballQuat = ball.rotationQuaternion!;
  const spinBall = (axis: Vector3, amount: number) => {
    const q = Quaternion.RotationAxis(axis, amount);
    q.multiplyToRef(ballQuat, ballQuat);
  };

  const finishRound = () => {
    state.mode = "complete";
    resetCharge();
    if (state.score > state.best) {
      state.best = state.score;
      state.newBest = state.score > 0;
      writeStore(BEST_KEY, String(state.score));
    }
    state.message = state.badges.length === 3 ? "Session complete." : "Clock ran out — finish the badge set next run.";
    state.messageTone = "violet";
    sfx.buzzer();
    emit(true);
  };

  // ---------------------------------------------------------------- loop
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05) * timeScale;
    elapsed += dt;

    // Ambient arena animation (always on, including menus)
    arena.ribbonTex.uOffset = (arena.ribbonTex.uOffset + dt * 0.035) % 1;
    arena.update(dt, elapsed, cheerT);
    cheerT = Math.max(0, cheerT - dt);
    if (boardFlashT > 0) {
      boardFlashT -= dt;
      if (boardFlashT <= 0) boardFlash = null;
    }
    refreshBoard();
    badges.forEach((b) => {
      if (!b.node.isEnabled()) return;
      b.node.rotation.y += dt * 1.8;
      b.node.position.y = b.position.y + Math.sin(elapsed * 2.6 + b.position.x) * 0.1;
      (b.pad.material as StandardMaterial).alpha = 0.45 + Math.sin(elapsed * 3 + b.position.x) * 0.2;
    });

    const playing = state.mode === "playing";

    // Countdown
    if (playing) {
      const before = Math.ceil(state.timeLeft);
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      const now = Math.ceil(state.timeLeft);
      if (now !== before && now <= 5 && now > 0 && now !== lastTickSecond) {
        lastTickSecond = now;
        sfx.tick();
      }
      if (state.timeLeft <= 0) {
        finishRound();
      } else if (now !== before) emit();
    }

    // ---------------- movement
    let mx = 0;
    let mz = 0;
    if (playing && !demo) {
      mx = (keys.has("a") || keys.has("arrowleft") ? -1 : 0) + (keys.has("d") || keys.has("arrowright") ? 1 : 0) + joy.x;
      mz = (keys.has("w") || keys.has("arrowup") ? 1 : 0) + (keys.has("s") || keys.has("arrowdown") ? -1 : 0) + joy.z;
    } else if (playing && demo) {
      const target = badges.find((b) => !b.collected)?.position;
      if (target && state.badges.length < 3) {
        mx = Math.sign(Math.round((target.x - rig.root.position.x) * 4));
        mz = Math.sign(Math.round((target.z - rig.root.position.z) * 4));
      } else if (!shot && state.hasBall && !state.charging) {
        const dx = 0 - rig.root.position.x;
        const dz = -0.2 - rig.root.position.z;
        if (Math.hypot(dx, dz) > 0.35) {
          mx = dx;
          mz = dz;
        } else if (!demoCharging) {
          const plan = demoPlan[demoShotIndex % demoPlan.length];
          demoShotIndex += 1;
          demoReleaseAt = plan === "perfect" ? 0.65 : plan === "good" ? 0.56 : plan === "early" ? 0.3 : plan === "late" ? 0.9 : 1.05;
          startCharge();
          demoCharging = true;
        }
      }
      if (demoCharging && state.charging && demoReleaseAt <= 1 && state.charge >= demoReleaseAt) {
        releaseShot();
        demoCharging = false;
      }
    }
    const mlen = Math.hypot(mx, mz);
    const moving = mlen > 0.05 && !state.charging;
    if (moving) {
      const speed = keys.has("shift") ? 6.3 : 4.4;
      const nx = mx / Math.max(1, mlen);
      const nz = mz / Math.max(1, mlen);
      rig.root.position.x += nx * speed * dt;
      rig.root.position.z += nz * speed * dt;
      heading = wrapAngle(heading + wrapAngle(Math.atan2(nx, nz) - heading) * (1 - Math.exp(-12 * dt)));
      if (state.tutorialStep === 0) {
        state.tutorialStep = 1;
        setMessage("Nice. Walk into a glowing badge.", "cyan");
      }
    } else if (playing && (state.charging || state.badges.length === 3 || shot)) {
      const toRim = Math.atan2(rimCenter.x - rig.root.position.x, rimCenter.z - rig.root.position.z);
      heading = wrapAngle(heading + wrapAngle(toRim - heading) * (1 - Math.exp(-10 * dt)));
    }
    rig.root.position.x = Math.max(-COURT.halfW + 0.7, Math.min(COURT.halfW - 0.7, rig.root.position.x));
    rig.root.position.z = Math.max(COURT.midcourtZ + 0.6, Math.min(COURT.baselineZ - 1.5, rig.root.position.z));
    rig.root.rotation.y = heading;

    // ---------------- body animation
    moveAmount = damp(moveAmount, moving ? 1 : 0, 10, dt);
    walkPhase += dt * (keys.has("shift") ? 15 : 11) * moveAmount;
    const swing = Math.sin(walkPhase) * 0.5 * moveAmount;
    rig.legR.rotation.x = swing;
    rig.legL.rotation.x = -swing;
    rig.armL.rotation.x = damp(rig.armL.rotation.x, state.charging ? -1.9 : -swing * 0.6 - 0.1, 14, dt);
    rig.armL.rotation.z = damp(rig.armL.rotation.z, state.charging ? 0.35 : 0, 12, dt);
    let bob = Math.abs(Math.sin(walkPhase)) * 0.07 * moveAmount;
    if (jumpT > 0) {
      jumpT += dt;
      const u = jumpT / 0.5;
      bob += Math.sin(Math.min(1, u) * Math.PI) * 0.42;
      if (u >= 1) jumpT = 0;
    }
    const crouch = state.charging ? Math.min(0.09, state.charge * 0.1) : 0;
    rig.body.position.y = damp(rig.body.position.y, bob - crouch * 1.4, 22, dt);
    rig.body.rotation.x = damp(rig.body.rotation.x, moveAmount * 0.12, 8, dt);
    rig.body.scaling.y = damp(rig.body.scaling.y, 1 - crouch * 0.6, 16, dt);

    // Shooting arm: raise with charge, snap through on release
    followThroughT = Math.max(0, followThroughT - dt);
    let armTarget = -0.1;
    if (state.charging) armTarget = -1.9 - state.charge * 0.55;
    else if (followThroughT > 0) armTarget = -2.75;
    else if (state.hasBall && moveAmount > 0.1) armTarget = -0.35 - Math.max(0, Math.sin(dribblePhase)) * 0.35;
    rig.armR.rotation.x = damp(rig.armR.rotation.x, armTarget, state.charging ? 16 : 11, dt);

    // Shadow blob tracks jump height
    rig.shadow.scaling.setAll(1 - Math.min(0.3, rig.body.position.y * 0.6));

    // ---------------- badges
    if (playing) {
      badges.forEach((b) => {
        if (b.collected) {
          if (b.collectT > 0) {
            b.collectT = Math.max(0, b.collectT - dt);
            const u = 1 - b.collectT / 0.4;
            b.node.scaling.setAll(1 + u * 0.8);
            b.node.position.y += u * 0.6;
            if (b.collectT === 0) {
              b.node.setEnabled(false);
              b.beam.setEnabled(false);
              b.pad.setEnabled(false);
            }
          }
          return;
        }
        const dx = rig.root.position.x - b.position.x;
        const dz = rig.root.position.z - b.position.z;
        if (dx * dx + dz * dz < 1.3 * 1.3) {
          b.collected = true;
          b.collectT = 0.4;
          b.label.setEnabled(false);
          state.badges.push(b.kind);
          state.score += 100;
          state.tutorialStep = state.badges.length === 3 ? 3 : 2;
          pickup.color1 = b.color.toColor4(1);
          pickup.color2 = COLORS.white.toColor4(1);
          pickup.emitter = b.position.clone();
          pickup.manualEmitCount = 70;
          sfx.badge();
          pushEvent(b.kind, "+100  ·  BADGE UNLOCKED", b.kind === "SPEED" ? "cyan" : b.kind === "FOCUS" ? "orange" : "violet");
          if (state.badges.length === 3) {
            state.message = `Shot unlocked! Hold ${coarse ? "SHOOT" : "SPACE"}, release in the sweet spot.`;
            state.messageTone = "orange";
          } else {
            state.message = `${b.kind} unlocked — ${3 - state.badges.length} to go.`;
            state.messageTone = b.kind === "FOCUS" ? "orange" : b.kind === "FLOW" ? "violet" : "cyan";
          }
          emit();
        }
      });
    }

    // ---------------- charge meter
    if (state.charging) {
      state.charge = Math.min(1, state.charge + CHARGE_RATE * dt);
      sfx.updateCharge(state.charge, state.charge >= SWEET_MIN && state.charge <= SWEET_MAX);
      targetGlow.setEnabled(true);
      targetGlow.scaling.setAll(1 + 0.12 * state.charge + Math.sin(elapsed * 12) * 0.04 * state.charge);
      const inSweet = state.charge >= SWEET_MIN && state.charge <= SWEET_MAX;
      targetMat.emissiveColor = inSweet ? COLORS.orangeHot : COLORS.softBlue.scale(0.8);
      if (state.charge >= 1) {
        overchargeTimer += dt;
        if (overchargeTimer >= OVERCHARGE_GRACE) {
          resetCharge();
          beginShot("miss", 1);
        }
      }
      emit();
    } else if (!shot) {
      targetGlow.setEnabled(false);
    }

    // ---------------- ball
    const hand = anchorWorld();
    if (!shot) {
      if (state.hasBall && moveAmount > 0.1 && !state.charging) {
        // Dribble: hand → floor → hand
        dribblePhase += dt * (keys.has("shift") ? 12 : 9.5);
        const s = Math.cos(dribblePhase);
        const floorY = BALL_R;
        ball.position.set(hand.x, floorY + (hand.y - floorY) * Math.abs(s), hand.z);
        const sign = Math.sign(s);
        if (sign !== lastDribbleSign && Math.abs(s) < 0.3) {
          sfx.bounce(0.7);
        }
        lastDribbleSign = sign;
        spinBall(Vector3.Right(), dt * 8);
      } else {
        dribblePhase = 0;
        const idleBob = state.charging ? 0 : Math.sin(elapsed * 4) * 0.03;
        ball.position.set(hand.x, hand.y + idleBob + (state.charging ? 0.18 : 0), hand.z);
        spinBall(Vector3.Up(), dt * 0.9);
      }
    } else {
      const s = shot;
      if (s.phase === "flight") {
        s.t += dt / s.dur;
        const t = Math.min(1, s.t);
        const p = Vector3.Lerp(s.start, s.end, t);
        p.y += 4 * s.apex * t * (1 - t);
        ball.position.copyFrom(p);
        spinBall(Vector3.Right(), -dt * 16);
        targetGlow.scaling.setAll(1 + Math.sin(elapsed * 10) * 0.06);
        if (t >= 1) {
          s.phase = "loose";
          resolveShot(s);
        }
      } else if (s.phase === "loose") {
        s.looseT += dt;
        s.vel.y += GRAVITY * dt;
        // Net drag while the ball is inside the net
        const inNet = s.result !== "miss" && ball.position.y > COURT.rimY - 0.85 && ball.position.y < COURT.rimY + 0.1;
        if (inNet) s.vel.y = Math.max(s.vel.y, -3.2);
        ball.position.addInPlace(s.vel.scale(dt));
        if (ball.position.y < BALL_R) {
          ball.position.y = BALL_R;
          if (Math.abs(s.vel.y) > 1.2) {
            sfx.bounce(Math.min(1, Math.abs(s.vel.y) / 7));
            s.bounces += 1;
          }
          s.vel.y = Math.abs(s.vel.y) * 0.62;
          s.vel.x *= 0.82;
          s.vel.z *= 0.82;
        }
        spinBall(Vector3.Right(), -dt * 6);
        if (s.looseT > 1.0) {
          s.phase = "return";
          s.t = 0;
          s.returnFrom = ball.position.clone();
          targetGlow.setEnabled(false);
          clearTrail();
        }
      } else {
        // Pass back to the player
        s.t += dt / 0.42;
        const t = Math.min(1, s.t);
        const e = t * t * (3 - 2 * t);
        const p = Vector3.Lerp(s.returnFrom, hand, e);
        p.y += Math.sin(t * Math.PI) * 0.9;
        ball.position.copyFrom(p);
        spinBall(Vector3.Right(), dt * 10);
        if (t >= 1) {
          shot = null;
          state.hasBall = true;
          emit(true);
        }
      }
    }
    fire.emitRate = state.onFire && state.mode === "playing" ? (shot?.phase === "flight" ? 260 : 70) : 0;
    rimLight.intensity = damp(rimLight.intensity, state.onFire ? 2.2 : 0.9, 4, dt);

    // Contact shadow
    ballShadow.position.set(ball.position.x, 0.03, ball.position.z);
    const h = Math.max(0, ball.position.y - BALL_R);
    ballShadow.scaling.setAll(Math.max(0.35, 1 - h * 0.18));
    (ballShadow.material as StandardMaterial).alpha = Math.max(0.08, 0.5 - h * 0.1);

    // ---------------- net swish
    if (netT > 0) {
      netT = Math.max(0, netT - dt);
      const k = netT / 0.55;
      const pulse = Math.sin((1 - k) * Math.PI * 2.2) * k;
      hoop.net.scaling.y = 1 + pulse * 0.32;
      hoop.net.scaling.x = hoop.net.scaling.z = 1 - pulse * 0.14;
      hoop.net.rotation.x = pulse * 0.08;
    } else {
      hoop.net.scaling.setAll(1);
      hoop.net.rotation.x = 0;
    }

    // ---------------- camera: gentle follow + FX
    const idleSway = state.mode === "ready" ? Math.sin(elapsed * 0.25) * 0.14 : 0;
    const followX = playing ? rig.root.position.x * 0.32 : 0;
    const followZ = playing ? Math.min(0, rig.root.position.z + 1) * 0.18 : 0;
    camera.target.x = damp(camera.target.x, CAM.target.x + followX, 3, dt);
    camera.target.z = damp(camera.target.z, CAM.target.z + followZ, 3, dt);
    camera.target.y = CAM.target.y;
    camera.alpha = CAM.alpha + idleSway - (playing ? rig.root.position.x * 0.012 : 0);
    camera.beta = CAM.beta;
    camera.radius = CAM.radius;
    // Portrait / narrow screens: lock horizontal FOV so the whole half-court stays in frame
    const aspect = engine.getAspectRatio(camera);
    if (aspect < 1.25) {
      camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
      camera.fov = 1.05;
      camera.radius = CAM.radius + 1.5;
      camera.beta = CAM.beta - 0.08;
    } else {
      camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
      camera.fov = 0.78;
    }
    if (camFx) {
      camFx.t += dt;
      const dur = camFx.kind === "make" ? 0.45 : 0.3;
      const u = Math.min(1, camFx.t / dur);
      if (camFx.kind === "make") {
        const punch = Math.sin(u * Math.PI) * (1 - u * 0.4);
        camera.radius -= punch * 0.85;
        camera.target.y += punch * 0.12;
      } else {
        const d = 1 - u;
        camera.alpha += Math.sin(u * Math.PI * 7) * 0.012 * d;
        camera.beta += Math.sin(u * Math.PI * 5) * 0.008 * d;
      }
      if (u >= 1) camFx = null;
    }
  });

  emit(true);

  return {
    scene,
    restart,
    onState: (listener) => {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    setMove: (x, z) => {
      joy.set(x, 0, z);
    },
    shootDown: () => {
      if (demo) return;
      startCharge();
    },
    shootUp: () => {
      if (demo) return;
      releaseShot();
    },
    setMuted,
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      clearTrail();
      sfx.dispose();
      pipeline?.dispose();
      scene.dispose();
    },
  };
}

// ===========================================================================
// Builders
// ===========================================================================

function burst(
  scene: Scene,
  name: string,
  capacity: number,
  texture: DynamicTexture,
  c1: Color4,
  c2: Color4,
  o: { size: [number, number]; life: [number, number]; power: [number, number]; gravity: number; additive: boolean },
) {
  const ps = new ParticleSystem(name, capacity, scene);
  ps.particleTexture = texture;
  ps.emitter = Vector3.Zero();
  ps.minEmitBox = new Vector3(-0.15, -0.05, -0.15);
  ps.maxEmitBox = new Vector3(0.15, 0.1, 0.15);
  ps.color1 = c1;
  ps.color2 = c2;
  ps.colorDead = new Color4(c2.r * 0.3, c2.g * 0.3, c2.b * 0.3, 0);
  ps.minSize = o.size[0];
  ps.maxSize = o.size[1];
  ps.minLifeTime = o.life[0];
  ps.maxLifeTime = o.life[1];
  ps.emitRate = 0;
  ps.blendMode = o.additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
  ps.gravity = new Vector3(0, o.gravity, 0);
  ps.direction1 = new Vector3(-2, 1.4, -2);
  ps.direction2 = new Vector3(2, 4.5, 2);
  ps.minEmitPower = o.power[0];
  ps.maxEmitPower = o.power[1];
  ps.updateSpeed = 0.016;
  ps.start();
  return ps;
}

function buildHoop(scene: Scene, shadows: ShadowGenerator, reflect: (...m: Mesh[]) => void) {
  // Simplified icon hoop: one mount, short neck, projecting rim, clean net.
  const { rimZ, rimY } = COURT;
  const rimD = 1.12;
  const rimR = rimD / 2;
  const boardZ = rimZ + rimR + 0.68;
  const postZ = COURT.baselineZ + 1.1;

  const steel = lit(scene, "hoop-steel", new Color3(0.16, 0.2, 0.28), 0.1, 0.4);
  const padMat = lit(scene, "hoop-pad", COLORS.navy, 0.2);
  const orangePad = toonMaterial(scene, "hoop-pad-orange", COLORS.orange, 0.5);
  const frameMat = lit(scene, "board-frame", new Color3(0.9, 0.92, 0.96), 0.35, 0.3);
  const glass = new StandardMaterial("board-glass", scene);
  glass.diffuseColor = new Color3(0.55, 0.7, 0.85);
  glass.emissiveColor = new Color3(0.08, 0.12, 0.18);
  glass.specularColor = new Color3(1, 1, 1);
  glass.specularPower = 128;
  glass.alpha = 0.22;
  const lineMat = unlit(scene, "board-lines", new Color3(0.96, 0.97, 1));
  const rimMat = unlit(scene, "rim-mat", new Color3(1, 0.42, 0.08));
  const meshes: Mesh[] = [];
  const box = (n: string, w: number, h: number, d: number, pos: Vector3, mat: Material) => {
    const m = MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, scene);
    m.position = pos;
    m.material = mat;
    meshes.push(m);
    return m;
  };

  // Stanchion base + post + arm
  box("hoop-base", 1.4, 0.7, 1.8, new Vector3(0, 0.35, postZ + 0.7), padMat);
  box("hoop-base-stripe", 1.42, 0.1, 1.82, new Vector3(0, 0.62, postZ + 0.7), orangePad);
  const post = MeshBuilder.CreateCylinder("hoop-post", { height: 3.6, diameter: 0.26, tessellation: 16 }, scene);
  post.position = new Vector3(0, 2.3, postZ + 0.55);
  post.material = steel;
  meshes.push(post);
  box("hoop-post-pad", 0.44, 1.4, 0.44, new Vector3(0, 1.3, postZ + 0.55), padMat);
  box("hoop-arm", 0.2, 0.18, postZ + 0.55 - boardZ, new Vector3(0, 3.95, (postZ + 0.55 + boardZ) / 2), steel);
  const brace = box("hoop-brace", 0.14, 0.14, 1.6, new Vector3(0, 3.35, (postZ + 0.55 + boardZ) / 2 + 0.1), steel);
  brace.rotation.x = -0.55;

  // Backboard
  const boardY = 3.3;
  const bw = 3.05;
  const bh = 1.85;
  const ft = 0.08;
  box("board-frame-top", bw, ft, 0.1, new Vector3(0, boardY + bh / 2 - ft / 2, boardZ), frameMat);
  box("board-frame-bot", bw, ft, 0.1, new Vector3(0, boardY - bh / 2 + ft / 2, boardZ), frameMat);
  box("board-frame-l", ft, bh, 0.1, new Vector3(-bw / 2 + ft / 2, boardY, boardZ), frameMat);
  box("board-frame-r", ft, bh, 0.1, new Vector3(bw / 2 - ft / 2, boardY, boardZ), frameMat);
  box("board-back-brace", 1.2, 0.9, 0.06, new Vector3(0, boardY, boardZ + 0.1), steel);
  box("board-glass", 2.92, 1.72, 0.04, new Vector3(0, boardY, boardZ - 0.02), glass);
  // Shooter's square + border as thin strips
  const sq = { w: 0.94, h: 0.72, y: boardY - 0.12, t: 0.05, z: boardZ - 0.05 };
  box("sq-top", sq.w, sq.t, 0.01, new Vector3(0, sq.y + sq.h / 2, sq.z), lineMat);
  box("sq-l", sq.t, sq.h, 0.01, new Vector3(-sq.w / 2, sq.y, sq.z), lineMat);
  box("sq-r", sq.t, sq.h, 0.01, new Vector3(sq.w / 2, sq.y, sq.z), lineMat);
  box("sq-bot", sq.w, sq.t, 0.01, new Vector3(0, sq.y - sq.h / 2, sq.z), lineMat);
  box("board-bottom-pad", 3.05, 0.16, 0.16, new Vector3(0, boardY - 0.97, boardZ - 0.02), orangePad);

  // Mount + neck + rim
  const mountZ = boardZ - 0.26;
  box("rim-mount", 0.6, 0.34, 0.36, new Vector3(0, rimY + 0.1, mountZ), orangePad);
  const neckStart = mountZ - 0.18;
  const neckEnd = rimZ + rimR - 0.04;
  box("rim-neck", 0.26, 0.08, Math.max(0.1, neckStart - neckEnd), new Vector3(0, rimY + 0.01, (neckStart + neckEnd) / 2), rimMat);
  const rim = MeshBuilder.CreateTorus("rim", { diameter: rimD, thickness: 0.09, tessellation: 56 }, scene);
  rim.position = new Vector3(0, rimY, rimZ);
  rim.material = rimMat;
  meshes.push(rim);

  // Net: diamond lattice as a single line system
  const net = new TransformNode("net", scene);
  net.position = new Vector3(0, rimY - 0.03, rimZ);
  const levels = 6;
  const strands = 14;
  const pts: Vector3[][] = [];
  for (let l = 0; l < levels; l += 1) {
    const u = l / (levels - 1);
    const r = (rimR - 0.03) * (1 - u * 0.42);
    const y = -u * 0.82;
    const row: Vector3[] = [];
    for (let s = 0; s < strands; s += 1) {
      const a = ((s + (l % 2) * 0.5) / strands) * Math.PI * 2;
      row.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    pts.push(row);
  }
  const lines: Vector3[][] = [];
  for (let l = 0; l < levels - 1; l += 1) {
    for (let s = 0; s < strands; s += 1) {
      const a = pts[l][s];
      const b1 = pts[l + 1][s];
      const b2 = pts[l + 1][(s + (l % 2 === 0 ? strands - 1 : 1)) % strands];
      lines.push([a, b1], [a, b2]);
    }
  }
  // bottom ring
  lines.push([...pts[levels - 1], pts[levels - 1][0]]);
  const netMesh = MeshBuilder.CreateLineSystem("net-lines", { lines }, scene);
  netMesh.color = new Color3(0.96, 0.97, 1);
  netMesh.alpha = 0.9;
  netMesh.parent = net;

  meshes.forEach((m) => shadows.addShadowCaster(m));
  reflect(...meshes);
  return { rim, net };
}

function buildArena(scene: Scene, reflect: (...m: Mesh[]) => void, low: boolean) {
  const glow = new GlowLayer("glow", scene, { mainTextureRatio: 0.5, blurKernelSize: 40 });
  glow.intensity = 0.75;

  const stepMat = lit(scene, "stand-step", new Color3(0.06, 0.1, 0.18), 0.12);
  const stepAlt = lit(scene, "stand-step-alt", new Color3(0.08, 0.13, 0.22), 0.12);
  const wallMat = lit(scene, "arena-wall", new Color3(0.035, 0.06, 0.11), 0.2);

  // Crowd: one capsule mesh, many thin instances with per-fan colours.
  const fan = MeshBuilder.CreateCapsule("fan", { height: 0.72, radius: 0.22, tessellation: 8, capSubdivisions: 3 }, scene);
  const head = MeshBuilder.CreateSphere("fan-head", { diameter: 0.3, segments: 6 }, scene);
  const headMat = new StandardMaterial("fan-head-mat", scene);
  headMat.diffuseColor = new Color3(1, 1, 1);
  headMat.emissiveColor = new Color3(0.05, 0.05, 0.06);
  headMat.specularColor = Color3.Black();
  head.material = headMat;
  const headColors: number[] = [];
  const skins = [
    [0.55, 0.36, 0.24],
    [0.38, 0.24, 0.15],
    [0.72, 0.52, 0.38],
    [0.26, 0.17, 0.11],
    [0.8, 0.62, 0.48],
  ];
  const fanMat = new StandardMaterial("fan-mat", scene);
  fanMat.diffuseColor = new Color3(1, 1, 1);
  fanMat.emissiveColor = new Color3(0.08, 0.08, 0.1);
  fanMat.specularColor = Color3.Black();
  fan.material = fanMat;
  const fanPos: Vector3[] = [];
  const fanPhase: number[] = [];
  const palette = [
    [0.1, 0.2, 0.45],
    [0.07, 0.14, 0.3],
    [0.9, 0.38, 0.12],
    [0.85, 0.87, 0.92],
    [0.22, 0.26, 0.34],
    [0.12, 0.3, 0.55],
    [0.5, 0.35, 0.8],
  ];
  const colors: number[] = [];
  const addFan = (x: number, y: number, z: number, density = 0.85) => {
    if (Math.random() > density * (low ? 0.6 : 1)) return;
    fanPos.push(new Vector3(x + (Math.random() - 0.5) * 0.18, y + 0.45, z + (Math.random() - 0.5) * 0.1));
    fanPhase.push(Math.random() * Math.PI * 2);
    const c = palette[(Math.random() * palette.length) | 0];
    const s = 0.35 + Math.random() * 0.3;
    colors.push(c[0] * s, c[1] * s, c[2] * s, 1);
    const k = skins[(Math.random() * skins.length) | 0];
    headColors.push(k[0] * 0.6, k[1] * 0.6, k[2] * 0.6, 1);
  };

  const rows = 9;
  const rowH = 0.42;
  const rowD = 0.85;
  // Far stands (behind the hoop)
  const farZ0 = FLOOR.maxZ + 0.6;
  for (let r = 0; r < rows; r += 1) {
    const y = 0.6 + r * rowH;
    const z = farZ0 + r * rowD;
    const step = MeshBuilder.CreateBox(`far-step-${r}`, { width: 34, height: y, depth: rowD }, scene);
    step.position = new Vector3(0, y / 2, z + rowD / 2);
    step.material = r % 2 ? stepAlt : stepMat;
    for (let x = -16; x <= 16; x += 0.62) addFan(x, y, z + rowD * 0.45);
  }
  // Side stands
  [-1, 1].forEach((side) => {
    const x0 = FLOOR.maxX + 0.6;
    for (let r = 0; r < rows; r += 1) {
      const y = 0.6 + r * rowH;
      const x = side * (x0 + r * rowD + rowD / 2);
      const step = MeshBuilder.CreateBox(`side-step-${side}-${r}`, { width: rowD, height: y, depth: 26 }, scene);
      step.position = new Vector3(x, y / 2, 0);
      step.material = r % 2 ? stepAlt : stepMat;
      for (let z = -12; z <= FLOOR.maxZ + 0.3; z += 0.62) addFan(x, y, z, 0.8);
    }
  });
  const fanCount = fanPos.length;
  const matrices = new Float32Array(fanCount * 16);
  const headMatrices = new Float32Array(fanCount * 16);
  const writeFans = (lift: (i: number) => number) => {
    const m = new Matrix();
    for (let i = 0; i < fanCount; i += 1) {
      const p = fanPos[i];
      const l = lift(i);
      Matrix.TranslationToRef(p.x, p.y + l, p.z, m);
      m.copyToArray(matrices, i * 16);
      Matrix.TranslationToRef(p.x, p.y + l + 0.52, p.z, m);
      m.copyToArray(headMatrices, i * 16);
    }
    fan.thinInstanceSetBuffer("matrix", matrices, 16, false);
    head.thinInstanceSetBuffer("matrix", headMatrices, 16, false);
  };
  writeFans(() => 0);
  fan.thinInstanceSetBuffer("color", new Float32Array(colors), 4, true);
  head.thinInstanceSetBuffer("color", new Float32Array(headColors), 4, true);

  // Back wall + upper bowl darkness
  const wall = MeshBuilder.CreateBox("far-wall", { width: 60, height: 14, depth: 0.5 }, scene);
  wall.position = new Vector3(0, 7, farZ0 + rows * rowD + 0.6);
  wall.material = wallMat;
  [-1, 1].forEach((s) => {
    const w = MeshBuilder.CreateBox(`side-wall-${s}`, { width: 0.5, height: 14, depth: 60 }, scene);
    w.position = new Vector3(s * (FLOOR.maxX + 0.6 + rows * rowD + 0.6), 7, 0);
    w.material = wallMat;
  });

  // LED ribbon boards at the front of every stand
  const ribbonTex = createRibbonTexture(scene);
  const ribbonMat = new StandardMaterial("ribbon-mat", scene);
  ribbonMat.emissiveTexture = ribbonTex;
  ribbonMat.diffuseColor = Color3.Black();
  ribbonMat.specularColor = Color3.Black();
  ribbonMat.disableLighting = true;
  const ribbonFar = MeshBuilder.CreatePlane("ribbon-far", { width: 34, height: 0.55 }, scene);
  ribbonFar.position = new Vector3(0, 0.3, farZ0 - 0.01);
  ribbonFar.material = ribbonMat;
  ribbonTex.uScale = 2.6;
  [-1, 1].forEach((s) => {
    const r = MeshBuilder.CreatePlane(`ribbon-side-${s}`, { width: 26, height: 0.55 }, scene);
    r.position = new Vector3(s * (FLOOR.maxX + 0.59), 0.3, 0);
    r.rotation.y = s * -Math.PI / 2;
    r.material = ribbonMat;
    glow.addIncludedOnlyMesh(r);
  });
  glow.addIncludedOnlyMesh(ribbonFar);
  reflect(ribbonFar);

  // Hanging banners on the far wall (the three development badges)
  (
    [
      ["SPEED", "#5BB8F0", -9],
      ["FOCUS", "#FF6A2B", 0],
      ["FLOW", "#AD78FF", 9],
    ] as const
  ).forEach(([text, color, x]) => {
    const t = new DynamicTexture(`banner-${text}`, { width: 256, height: 512 }, scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#0B1F3A";
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 18);
    ctx.fillRect(0, 440, 256, 18);
    ctx.beginPath();
    ctx.moveTo(0, 470);
    ctx.lineTo(128, 512);
    ctx.lineTo(256, 470);
    ctx.fill();
    ctx.save();
    ctx.translate(128, 240);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `900 92px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#F4F7FF";
    ctx.fillText(text, 0, 0);
    ctx.restore();
    t.update(true);
    const m = new StandardMaterial(`banner-mat-${text}`, scene);
    m.diffuseTexture = t;
    m.emissiveTexture = t;
    m.emissiveColor = new Color3(0.4, 0.4, 0.4);
    m.specularColor = Color3.Black();
    const b = MeshBuilder.CreatePlane(`banner-${text}`, { width: 2.2, height: 4.4 }, scene);
    b.position = new Vector3(x, 9.2, farZ0 + rows * rowD + 0.3);
    b.material = m;
  });

  // Hanging scoreboard above the far stands
  const boardTex = new DynamicTexture("scoreboard-tex", { width: 1024, height: 384 }, scene, true);
  const sbMat = new StandardMaterial("scoreboard-mat", scene);
  sbMat.emissiveTexture = boardTex;
  sbMat.diffuseColor = Color3.Black();
  sbMat.specularColor = Color3.Black();
  sbMat.disableLighting = true;
  const sb = MeshBuilder.CreatePlane("scoreboard", { width: 7.2, height: 2.7 }, scene);
  sb.position = new Vector3(0, 8.8, farZ0 + 3.2);
  sb.material = sbMat;
  const sbFrame = MeshBuilder.CreateBox("scoreboard-frame", { width: 7.6, height: 3.1, depth: 0.5 }, scene);
  sbFrame.position = new Vector3(0, 8.8, farZ0 + 3.47);
  sbFrame.material = lit(scene, "sb-frame", new Color3(0.05, 0.07, 0.1), 0.05, 0.2);
  [-2.6, 2.6].forEach((x, i) => {
    const cable = MeshBuilder.CreateCylinder(`sb-cable-${i}`, { height: 8, diameter: 0.04 }, scene);
    cable.position = new Vector3(x, 14.3, farZ0 + 3.4);
    cable.material = wallMat;
  });
  glow.addIncludedOnlyMesh(sb);

  // Ceiling light rig + fake volumetric cones
  const beamTex = createBeamTexture(scene, "light-cone-tex", true);
  const coneMat = unlit(scene, "light-cone", new Color3(1, 0.86, 0.66), 0.09, true);
  coneMat.opacityTexture = beamTex;
  coneMat.backFaceCulling = false;
  const lampMat = unlit(scene, "lamp", new Color3(1, 0.95, 0.85));
  const trussMat = lit(scene, "truss", new Color3(0.08, 0.1, 0.14), 0.05);
  [-4.5, 4.5].forEach((z, zi) => {
    const truss = MeshBuilder.CreateBox(`truss-${zi}`, { width: 22, height: 0.25, depth: 0.25 }, scene);
    truss.position = new Vector3(0, 12, z);
    truss.material = trussMat;
    [-7.5, -2.5, 2.5, 7.5].forEach((x, xi) => {
      const lamp = MeshBuilder.CreateCylinder(`lamp-${zi}-${xi}`, { height: 0.2, diameter: 0.7, tessellation: 20 }, scene);
      lamp.position = new Vector3(x, 11.8, z);
      lamp.material = lampMat;
      glow.addIncludedOnlyMesh(lamp);
      const cone = MeshBuilder.CreateCylinder(`cone-${zi}-${xi}`, { height: 9, diameterTop: 0.6, diameterBottom: 4.2, tessellation: 32, cap: Mesh.NO_CAP }, scene);
      cone.position = new Vector3(x, 11.8 - 4.5, z);
      cone.material = coneMat;
    });
  });

  // Floating haze motes in the light
  const haze = new ParticleSystem("haze", 180, scene);
  haze.particleTexture = createSoftDotTexture(scene, "haze-tex", "rgba(255,240,220,0.9)", "rgba(255,220,180,0.25)");
  haze.emitter = new Vector3(0, 4, 0);
  haze.minEmitBox = new Vector3(-11, -3.5, -8);
  haze.maxEmitBox = new Vector3(11, 5, 8);
  haze.color1 = new Color4(1, 0.9, 0.75, 0.2);
  haze.color2 = new Color4(0.7, 0.8, 1, 0.12);
  haze.colorDead = new Color4(0, 0, 0, 0);
  haze.minSize = 0.03;
  haze.maxSize = 0.08;
  haze.minLifeTime = 6;
  haze.maxLifeTime = 12;
  haze.emitRate = 18;
  haze.blendMode = ParticleSystem.BLENDMODE_ADD;
  haze.gravity = new Vector3(0, 0.02, 0);
  haze.direction1 = new Vector3(-0.1, -0.05, -0.1);
  haze.direction2 = new Vector3(0.1, 0.08, 0.1);
  haze.minEmitPower = 0.05;
  haze.maxEmitPower = 0.2;
  haze.preWarmCycles = 300;
  haze.start();

  let wasCheering = false;
  const update = (_dt: number, t: number, cheer: number) => {
    if (cheer > 0) {
      const k = Math.min(1, cheer);
      writeFans((i) => Math.max(0, Math.sin(t * 13 + fanPhase[i])) * 0.28 * k);
      wasCheering = true;
    } else if (wasCheering) {
      writeFans(() => 0);
      wasCheering = false;
    }
  };

  return { glow, ribbonTex, boardTex, update };
}
