# Baller Path: Court Lab — AI handoff (v2)

Browser basketball side quest. React + Vite + TypeScript + Babylon.js. Static site (no server), deployed to GitHub Pages.

## Files
- `src/game/scene.ts` — scene setup, lights/shadows/post, hoop + arena builders, game state, input, shot physics, demo autopilot
- `src/game/player.ts` — player rig (root → body → limb pivots). Model faces +Z (toward rim)
- `src/game/textures.ts` — every texture is procedural (DynamicTexture canvases)
- `src/game/audio.ts` — Web Audio synth SFX, unlocked on first gesture
- `src/components/GameCanvas.tsx` — Babylon lifecycle (one engine, dispose on unmount), HUD, overlays, touch controls
- `src/styles.css` — HUD design system (navy / orange / soft-blue / violet)

## Contracts — do not regress
- Shot feel: `CHARGE_RATE = 0.78`, sweet 0.52–0.78, perfect 0.60–0.70, overcharge grace 0.12s
- Shooting is gated until all 3 badges are collected
- Rim world position `(0, 2.62, 5.55)`; hoop stays simplified (one mount, short neck)
- `GameHandle` API: `onState`, `restart`, `setMove`, `shootDown`, `shootUp`, `setMuted`, `dispose`
- `?demo` autopilot must keep working (`&speed=N` fast-forwards for screenshots)
- No binary assets in the repo; no credentials

## Verify
`pnpm check && pnpm build`, then `pnpm dev` and open `/?demo&speed=4`.

## Ideas for next
Drill select (dribble / passing / defense), shot aiming by court position (3PT bonus), leaderboard, Storm/Baller Path account tie-in.
