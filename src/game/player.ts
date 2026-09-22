import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import "@babylonjs/core/Rendering/outlineRenderer";

export const PLAYER_COLORS = {
  jersey: new Color3(0.07, 0.25, 0.66),
  jerseyDeep: new Color3(0.05, 0.14, 0.32),
  orange: new Color3(1, 0.42, 0.12),
  orangeHot: new Color3(1, 0.54, 0.16),
  softBlue: new Color3(0.4, 0.78, 1),
  skin: new Color3(0.55, 0.35, 0.22),
  ink: new Color3(0.03, 0.04, 0.07),
  white: new Color3(0.95, 0.97, 1),
};

/**
 * Cel-style lit material: diffuse gets real light/shadow, emissive floor keeps
 * brand colours from ever going muddy. Outlines give the chunky Jam read.
 */
export function toonMaterial(scene: Scene, name: string, color: Color3, glow = 0.42) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(glow);
  mat.specularColor = new Color3(0.08, 0.08, 0.08);
  mat.specularPower = 24;
  return mat;
}

export type PlayerRig = {
  root: TransformNode;
  body: TransformNode;
  armR: TransformNode;
  armL: TransformNode;
  legR: TransformNode;
  legL: TransformNode;
  ballAnchor: TransformNode;
  meshes: Mesh[];
  shadow: Mesh;
};

/**
 * Chunky cartoon baller rig. Model faces +Z (toward the rim).
 * Hierarchy: root (position/heading) → body (bob/crouch) → limbs on pivots.
 */
export function createPlayer(scene: Scene, jerseyBack: DynamicTexture): PlayerRig {
  const C = PLAYER_COLORS;
  const root = new TransformNode("player-root", scene);
  root.position = new Vector3(0, 0, -3.6);
  const body = new TransformNode("player-body", scene);
  body.parent = root;

  const jersey = toonMaterial(scene, "p-jersey", C.jersey);
  const jerseyDeep = toonMaterial(scene, "p-jersey-deep", C.jerseyDeep, 0.5);
  const accent = toonMaterial(scene, "p-accent", C.orange, 0.55);
  const accentHot = toonMaterial(scene, "p-accent-hot", C.orangeHot, 0.6);
  const soft = toonMaterial(scene, "p-soft", C.softBlue, 0.5);
  const skin = toonMaterial(scene, "p-skin", C.skin, 0.38);
  const ink = toonMaterial(scene, "p-ink", C.ink, 0.2);
  const white = toonMaterial(scene, "p-white", C.white, 0.55);

  const meshes: Mesh[] = [];
  const add = <T extends Mesh>(m: T, mat: StandardMaterial, parent: TransformNode, pos: Vector3, outline = true) => {
    m.material = mat;
    m.parent = parent;
    m.position = pos;
    if (outline) {
      m.renderOutline = true;
      m.outlineColor = new Color3(0.02, 0.04, 0.09);
      m.outlineWidth = 0.022;
    }
    meshes.push(m);
    return m;
  };

  // --- Torso ---
  add(MeshBuilder.CreateBox("p-torso", { width: 1.2, height: 0.8, depth: 0.6 }, scene), jersey, body, new Vector3(0, 1.02, 0.06));
  add(MeshBuilder.CreateBox("p-shoulders", { width: 1.5, height: 0.34, depth: 0.58 }, scene), jersey, body, new Vector3(0, 1.36, 0.04));
  add(MeshBuilder.CreateBox("p-stripe-l", { width: 0.12, height: 0.8, depth: 0.62 }, scene), accent, body, new Vector3(-0.5, 1.02, 0.06), false);
  add(MeshBuilder.CreateBox("p-stripe-r", { width: 0.12, height: 0.8, depth: 0.62 }, scene), accent, body, new Vector3(0.5, 1.02, 0.06), false);
  const collar = add(MeshBuilder.CreateTorus("p-collar", { diameter: 0.46, thickness: 0.07 }, scene), accent, body, new Vector3(0, 1.53, 0.06), false);
  collar.scaling = new Vector3(1.2, 0.7, 1);

  // Front number plate
  const front = add(MeshBuilder.CreatePlane("p-front-num", { width: 0.62, height: 0.62 }, scene), toonMaterial(scene, "p-front-mat", C.white, 1), body, new Vector3(0, 1.05, 0.37), false);
  front.rotation.y = Math.PI;
  // Jersey back — the broadcast camera mostly sees this side
  const backMat = new StandardMaterial("p-back-mat", scene);
  backMat.diffuseTexture = jerseyBack;
  backMat.emissiveTexture = jerseyBack;
  backMat.opacityTexture = jerseyBack;
  backMat.useAlphaFromDiffuseTexture = true;
  backMat.specularColor = Color3.Black();
  backMat.transparencyMode = Material.MATERIAL_ALPHATEST;
  const back = add(MeshBuilder.CreatePlane("p-back-num", { width: 0.82, height: 0.82 }, scene), backMat as StandardMaterial, body, new Vector3(0, 1.06, -0.275), false);
  back.rotation.y = 0;
  front.material = backMat;

  // --- Head ---
  add(MeshBuilder.CreateCylinder("p-neck", { height: 0.22, diameter: 0.28, tessellation: 12 }, scene), skin, body, new Vector3(0, 1.6, 0.06), false);
  const head = add(MeshBuilder.CreateSphere("p-head", { diameter: 0.9, segments: 20 }, scene), skin, body, new Vector3(0, 1.93, 0.1));
  head.scaling = new Vector3(1.06, 1.04, 1);
  const hair = add(MeshBuilder.CreateSphere("p-hair", { diameter: 0.93, segments: 16, slice: 0.55 }, scene), ink, body, new Vector3(0, 1.97, 0.08), false);
  hair.scaling = new Vector3(1.07, 1.06, 1.02);
  const band = add(MeshBuilder.CreateTorus("p-headband", { diameter: 0.9, thickness: 0.08, tessellation: 28 }, scene), accent, body, new Vector3(0, 2.06, 0.09), false);
  band.scaling = new Vector3(1.07, 1, 1.02);
  [-1, 1].forEach((s) => {
    add(MeshBuilder.CreateSphere(`p-ear-${s}`, { diameter: 0.17, segments: 8 }, scene), skin, body, new Vector3(0.46 * s, 1.92, 0.1), false).scaling = new Vector3(0.55, 0.9, 0.55);
    add(MeshBuilder.CreateSphere(`p-eye-${s}`, { diameter: 0.17, segments: 10 }, scene), white, body, new Vector3(0.18 * s, 1.96, 0.5), false);
    add(MeshBuilder.CreateSphere(`p-pupil-${s}`, { diameter: 0.085, segments: 8 }, scene), ink, body, new Vector3(0.18 * s, 1.96, 0.575), false);
    const brow = add(MeshBuilder.CreateBox(`p-brow-${s}`, { width: 0.2, height: 0.05, depth: 0.05 }, scene), ink, body, new Vector3(0.19 * s, 2.09, 0.5), false);
    brow.rotation.z = -0.2 * s;
  });
  const smile = add(MeshBuilder.CreateTorus("p-smile", { diameter: 0.3, thickness: 0.045, tessellation: 20 }, scene), white, body, new Vector3(0, 1.74, 0.49), false);
  smile.rotation.x = Math.PI / 2.4;
  smile.scaling = new Vector3(1, 0.4, 1);

  // --- Arms on shoulder pivots ---
  const makeArm = (s: 1 | -1) => {
    const pivot = new TransformNode(`p-arm-pivot-${s}`, scene);
    pivot.parent = body;
    pivot.position = new Vector3(0.8 * s, 1.36, 0.06);
    const upper = add(MeshBuilder.CreateCapsule(`p-arm-up-${s}`, { height: 0.5, radius: 0.16, tessellation: 12 }, scene), jersey, pivot, new Vector3(0.08 * s, -0.2, 0.04));
    upper.rotation.z = 0.18 * s;
    add(MeshBuilder.CreateBox(`p-sleeve-${s}`, { width: 0.36, height: 0.08, depth: 0.36 }, scene), accent, pivot, new Vector3(0.1 * s, -0.36, 0.05), false);
    const fore = add(MeshBuilder.CreateCapsule(`p-arm-fore-${s}`, { height: 0.46, radius: 0.13, tessellation: 12 }, scene), skin, pivot, new Vector3(0.16 * s, -0.58, 0.2));
    fore.rotation.x = -0.6;
    add(MeshBuilder.CreateBox(`p-wristband-${s}`, { width: 0.3, height: 0.08, depth: 0.3 }, scene), soft, pivot, new Vector3(0.18 * s, -0.7, 0.36), false).rotation.x = -0.6;
    add(MeshBuilder.CreateSphere(`p-hand-${s}`, { diameter: 0.28, segments: 10 }, scene), skin, pivot, new Vector3(0.19 * s, -0.78, 0.46));
    return pivot;
  };
  const armR = makeArm(1);
  const armL = makeArm(-1);
  const ballAnchor = new TransformNode("p-ball-anchor", scene);
  ballAnchor.parent = armR;
  ballAnchor.position = new Vector3(0.12, -0.84, 0.74);

  // --- Shorts ---
  add(MeshBuilder.CreateBox("p-shorts", { width: 1.12, height: 0.42, depth: 0.58 }, scene), jerseyDeep, body, new Vector3(0, 0.6, 0.08));
  add(MeshBuilder.CreateBox("p-waist", { width: 1.14, height: 0.1, depth: 0.6 }, scene), accent, body, new Vector3(0, 0.8, 0.08), false);

  // --- Legs on hip pivots ---
  const makeLeg = (s: 1 | -1) => {
    const pivot = new TransformNode(`p-leg-pivot-${s}`, scene);
    pivot.parent = body;
    pivot.position = new Vector3(0.34 * s, 0.56, 0.1);
    add(MeshBuilder.CreateCapsule(`p-thigh-${s}`, { height: 0.42, radius: 0.18, tessellation: 12 }, scene), jerseyDeep, pivot, new Vector3(0.02 * s, -0.1, 0));
    add(MeshBuilder.CreateCapsule(`p-calf-${s}`, { height: 0.34, radius: 0.13, tessellation: 12 }, scene), skin, pivot, new Vector3(0.05 * s, -0.34, 0.04));
    add(MeshBuilder.CreateCylinder(`p-sock-${s}`, { height: 0.18, diameter: 0.27, tessellation: 12 }, scene), white, pivot, new Vector3(0.05 * s, -0.42, 0.06), false);
    add(MeshBuilder.CreateBox(`p-shoe-${s}`, { width: 0.42, height: 0.18, depth: 0.66 }, scene), ink, pivot, new Vector3(0.06 * s, -0.47, 0.14));
    add(MeshBuilder.CreateBox(`p-sole-${s}`, { width: 0.44, height: 0.06, depth: 0.68 }, scene), white, pivot, new Vector3(0.06 * s, -0.53, 0.14), false);
    add(MeshBuilder.CreateBox(`p-swoosh-${s}`, { width: 0.44, height: 0.07, depth: 0.2 }, scene), accentHot, pivot, new Vector3(0.06 * s, -0.44, 0.24), false);
    return pivot;
  };
  const legR = makeLeg(1);
  const legL = makeLeg(-1);

  // Soft blob shadow (real shadow map is layered on top)
  const shadow = MeshBuilder.CreateDisc("p-blob", { radius: 0.85, tessellation: 28 }, scene);
  shadow.rotation.x = Math.PI / 2;
  shadow.position = new Vector3(0, 0.025, 0.1);
  const sm = new StandardMaterial("p-blob-mat", scene);
  sm.disableLighting = true;
  sm.emissiveColor = new Color3(0.01, 0.02, 0.05);
  sm.alpha = 0.35;
  shadow.material = sm;
  shadow.parent = root;

  return { root, body, armR, armL, legR, legL, ballAnchor, meshes, shadow };
}
