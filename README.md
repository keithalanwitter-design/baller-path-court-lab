# Baller Path: Court Lab

A 45-second browser basketball side quest from **Baller Path**. Move around a lit arena half-court, collect three development badges (Speed, Focus, Flow) to unlock your shot, then hold and release in the sweet spot to stack buckets and combos.

Built with **React + Vite + TypeScript + Babylon.js**. The game ships with no image or audio files: the court, crowd, textures and sound effects are all generated in code when the page loads.

**▶ Play it: https://keithalanwitter-design.github.io/baller-path-court-lab/**

![Court Lab gameplay](docs/screenshots/after-02-shot.jpg)

| Title | Results | Mobile |
| --- | --- | --- |
| ![Title](docs/screenshots/after-03-title.jpg) | ![Results](docs/screenshots/after-04-results.jpg) | ![Mobile](docs/screenshots/after-05-mobile.jpg) |

Before (v1) → after (v2): [`before-01-court-ball.jpg`](docs/screenshots/before-01-court-ball.jpg) vs [`after-01-court.jpg`](docs/screenshots/after-01-court.jpg)

## How to play

| Action | Desktop | Phone / tablet |
| --- | --- | --- |
| Move | `WASD` / arrow keys (`Shift` to burst) | Left thumb stick |
| Shoot | Hold `Space` (or mouse), release in the orange band | Hold **SHOOT**, release |
| Restart | `R` | ↻ button |
| Sound | `M` | 🔊 button |

- **Collect all 3 badges** to unlock shooting (+100 each).
- **Release in the sweet band** for a make. Release in the striped **perfect** zone to get a *SPLASH!* with more points.
- **Three makes in a row puts you ON FIRE**: flaming ball, bonus points on every make.
- Early = short, late = long, holding past full = airball. A miss resets your combo.
- Your best score is saved in your browser.

## Run locally

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build → dist/
```

Handy URL flags:

- `?demo`: autopilot plays a session, which is useful for screenshots. Add `&speed=4` to fast-forward it and `&secs=15` to shorten the session.
- `?quality=low` / `?quality=high`: override the automatic graphics tier. Touch devices default to low, which turns off floor reflections and uses lighter shadows and fewer fans.

## Project layout

```
src/
  components/GameCanvas.tsx   React HUD, overlays, touch controls, Babylon lifecycle
  game/scene.ts               Scene, lighting, hoop, arena, gameplay loop, shot physics
  game/player.ts              Rigged cartoon player (limb pivots for walk/dribble/shoot)
  game/textures.ts            Procedural court, LED ribbon, jersey, badges, scoreboard
  game/audio.ts               Web Audio synth sound kit
  styles.css                  HUD design system
```

## Deploy

Every push to `main` builds and deploys to **GitHub Pages** through `.github/workflows/deploy.yml`. In the repo settings, set **Pages → Source** to **GitHub Actions**.

## v2 overhaul (from the original build)

**Graphics**
- A real hardwood court painted procedurally: maple planks, navy key and apron, white lines, a BP centre logo and a baseline wordmark
- Glossy floor reflections, real-time soft shadows, ACES tone mapping, bloom, vignette, MSAA/FXAA
- A full arena: tiered stands with about 900 animated fans who jump on makes, scrolling LED ribbon boards, a hanging scoreboard that shows the live score, badge banners, ceiling light rigs with light cones, and floating haze
- A rebuilt hoop: glass backboard, thinner orange rim with glow, diamond-lattice net that swishes
- A rigged player: outlined cel shading, jersey name and number, walk cycle, dribbling, crouch-and-rise jump shot
- Badges are now spinning hex medals inside coloured light beams, with a pickup burst

**Gameplay feel**
- The ball flies, drops through the net or clanks off the rim, bounces on the floor, then gets passed back to you
- Misses are graded as short, long or airball
- "On fire" streak mode, confetti on perfect makes, camera punch and shake
- Synthesized sound: dribbles, swish, rim clank, crowd, badge chime, charge tone, shot-clock ticks, buzzer
- Stats at the end of the run: makes/attempts, accuracy, perfects, best streak, rank (Rookie → MVP) and a saved personal best
- Fixed: W/Up moved the player toward the camera. It now moves toward the rim.

**UI**
- A broadcast-style scorebug, drill tracker card, release meter with live feedback, big event pop-ups, and a title and results screen
- Mobile support: virtual joystick and SHOOT button, responsive layout, automatic low-graphics tier
- Removed the unused template code (40+ UI components, server, analytics, Manus plugins). The dependency list went from about 60 packages to 3 runtime packages.

The shot timing is unchanged from the original: about 1.28s to charge, a sweet band of 0.52–0.78 and a perfect band of 0.60–0.70.
