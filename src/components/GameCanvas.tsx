import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, type BadgeKind, type GameHandle, type GameState } from "@/game/scene";

const initialState: GameState = {
  mode: "ready",
  tutorialStep: 0,
  timeLeft: 45,
  score: 0,
  combo: 0,
  badges: [],
  hasBall: true,
  message: "",
  messageTone: "orange",
  charging: false,
  charge: 0,
  sweetSpotMin: 0.52,
  sweetSpotMax: 0.78,
  perfectMin: 0.6,
  perfectMax: 0.7,
  shots: 0,
  makes: 0,
  perfects: 0,
  bestCombo: 0,
  best: 0,
  newBest: false,
  onFire: false,
  muted: false,
  event: null,
};

const BADGE_META: Record<BadgeKind, { glyph: string; tone: string; hint: string }> = {
  SPEED: { glyph: "»", tone: "cyan", hint: "Left wing" },
  FOCUS: { glyph: "◎", tone: "orange", hint: "Top of the key" },
  FLOW: { glyph: "∿", tone: "violet", hint: "Right wing" },
};

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

function rankFor(score: number) {
  if (score >= 4500) return { rank: "MVP", note: "Automatic. That's a highlight-reel session." };
  if (score >= 2500) return { rank: "ALL-STAR", note: "Real rhythm. Chase more perfect releases." };
  if (score >= 1000) return { rank: "STARTER", note: "Solid reps. Stack combos to climb." };
  return { rank: "ROOKIE", note: "Every pro started here. Run it back." };
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const [state, setState] = useState<GameState>(initialState);
  const [loading, setLoading] = useState(true);
  const [touch] = useState(isTouch);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
    let handle: GameHandle | null = null;
    let unsubscribe: (() => void) | undefined;
    createGameScene(engine, canvas).then((next) => {
      if (disposed) {
        next.dispose();
        return;
      }
      handle = next;
      handleRef.current = next;
      unsubscribe = next.onState(setState);
      next.scene.executeWhenReady(() => setLoading(false));
      engine.runRenderLoop(() => next.scene.render());
    });
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      unsubscribe?.();
      handle?.dispose();
      engine.dispose();
      handleRef.current = null;
    };
  }, []);

  const ready = state.mode === "ready";
  const complete = state.mode === "complete";
  const playing = state.mode === "playing";
  const shotUnlocked = state.badges.length === 3;
  const pct = (v: number) => `${v * 100}%`;
  const accuracy = state.shots ? Math.round((state.makes / state.shots) * 100) : 0;
  const clock = Math.ceil(state.timeLeft);
  const inSweet = state.charge >= state.sweetSpotMin && state.charge <= state.sweetSpotMax;
  const inPerfect = state.charge >= state.perfectMin && state.charge <= state.perfectMax;

  return (
    <main className={`game-shell ${state.onFire ? "on-fire" : ""}`}>
      <canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} />
      <div className="screen-grade" />

      {/* ---------- Scorebug ---------- */}
      <header className={`scorebug ${ready || complete ? "hidden" : ""}`} aria-live="polite">
        <div className="sb-brand">
          <span className="brand-mark">BP</span>
          <div>
            <div className="eyebrow">BALLER PATH</div>
            <div className="sb-title">COURT LAB</div>
          </div>
        </div>
        <div className="sb-cell">
          <span className="eyebrow">SCORE</span>
          <strong className="num accent">{state.score.toLocaleString()}</strong>
        </div>
        <div className={`sb-cell sb-clock ${clock <= 10 && playing ? "urgent" : ""}`}>
          <span className="eyebrow">TIME</span>
          <strong className="num">
            0:{clock.toString().padStart(2, "0")}
          </strong>
        </div>
        <div className={`sb-cell sb-combo ${state.onFire ? "fire" : ""}`}>
          <span className="eyebrow">{state.onFire ? "ON FIRE" : "COMBO"}</span>
          <strong className="num">x{state.combo}</strong>
        </div>
        <div className="sb-cell sb-best">
          <span className="eyebrow">BEST</span>
          <strong className="num">{state.best.toLocaleString()}</strong>
        </div>
      </header>

      {/* ---------- Utility buttons ---------- */}
      <div className="util-buttons">
        <button
          className="icon-btn"
          aria-label={state.muted ? "Unmute" : "Mute"}
          title={state.muted ? "Unmute (M)" : "Mute (M)"}
          onClick={() => handleRef.current?.setMuted(!state.muted)}
        >
          {state.muted ? (
            <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
          )}
        </button>
        {playing && (
          <button className="icon-btn" aria-label="Restart" title="Restart (R)" onClick={() => handleRef.current?.restart()}>
            <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v5h5" /></svg>
          </button>
        )}
      </div>

      {/* ---------- Drill tracker ---------- */}
      {playing && (
        <aside className="drill-card">
          <div className="eyebrow">LIVE DRILL</div>
          <div className="drill-title">
            {shotUnlocked ? (
              <>
                Shot <span>unlocked.</span>
              </>
            ) : (
              <>
                Collect <span>3 badges.</span>
              </>
            )}
          </div>
          <ul className="badge-list">
            {(Object.keys(BADGE_META) as BadgeKind[]).map((b) => {
              const got = state.badges.includes(b);
              return (
                <li key={b} className={`badge-item tone-${BADGE_META[b].tone} ${got ? "got" : ""}`}>
                  <i>{BADGE_META[b].glyph}</i>
                  <div>
                    <b>{b}</b>
                    <small>{got ? "Unlocked" : BADGE_META[b].hint}</small>
                  </div>
                  <em>{got ? "✓" : ""}</em>
                </li>
              );
            })}
          </ul>
          <div className={`drill-step ${shotUnlocked ? "hot" : ""}`}>
            <span className="step-num">{shotUnlocked ? "02" : "01"}</span>
            {shotUnlocked ? "Hold · release in the sweet spot" : "Move into the light beams"}
          </div>
        </aside>
      )}

      {/* ---------- Event popup ---------- */}
      {state.event && playing && (
        <div key={state.event.id} className={`event-pop tone-${state.event.tone} ${state.event.big ? "big" : ""}`}>
          <div className="event-title">{state.event.title}</div>
          <div className="event-sub">{state.event.sub}</div>
        </div>
      )}

      {/* ---------- Coach + meter ---------- */}
      {playing && (
        <div className="bottom-stack">
          <div className={`coach tone-${state.messageTone}`}>{state.message}</div>
          {shotUnlocked && (
            <div className={`meter ${state.charging ? "active" : ""} ${inPerfect ? "perfect" : inSweet ? "sweet" : ""}`}>
              <div className="meter-head">
                <span className="eyebrow">RELEASE</span>
                <strong>{state.charging ? (inPerfect ? "PERFECT" : inSweet ? "SWEET" : state.charge > state.sweetSpotMax ? "LATE" : "BUILD…") : touch ? "HOLD SHOOT" : "HOLD SPACE"}</strong>
              </div>
              <div className="meter-track">
                <div className="meter-sweet" style={{ left: pct(state.sweetSpotMin), width: pct(state.sweetSpotMax - state.sweetSpotMin) }} />
                <div className="meter-perfect" style={{ left: pct(state.perfectMin), width: pct(state.perfectMax - state.perfectMin) }} />
                <div className="meter-fill" style={{ width: pct(Math.min(1, state.charge)) }} />
                <div className="meter-needle" style={{ left: pct(Math.min(1, state.charge)) }} />
                {[0.25, 0.5, 0.75].map((t) => (
                  <i key={t} className="meter-tick" style={{ left: pct(t) }} />
                ))}
              </div>
              <div className="meter-labels">
                <span>EARLY</span>
                <span className="sweet-label" style={{ left: pct((state.sweetSpotMin + state.sweetSpotMax) / 2) }}>
                  SWEET
                </span>
                <span>AIRBALL</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- Controls legend (desktop) ---------- */}
      {playing && !touch && (
        <div className="legend">
          <span><kbd>W A S D</kbd> move</span>
          <span><kbd>SHIFT</kbd> burst</span>
          <span><kbd className="wide">SPACE</kbd> hold · release</span>
          <span><kbd>M</kbd> sound</span>
        </div>
      )}

      {/* ---------- Touch controls ---------- */}
      {playing && touch && <TouchControls handle={handleRef} charging={state.charging} />}

      {/* ---------- Title / results ---------- */}
      {(ready || complete) && !loading && (
        <div className="overlay">
          {ready ? (
            <div className="panel title-panel">
              <div className="eyebrow accent">A BALLER PATH SIDE QUEST</div>
              <h1 className="title">
                COURT<span>LAB</span>
              </h1>
              <p className="lede">45 seconds. Three badges. As many buckets as you can time up.</p>
              <ol className="how">
                <li>
                  <b>01</b>
                  <div>
                    <strong>Move</strong>
                    <span>{touch ? "Left thumb stick" : "WASD / arrow keys · Shift to burst"}</span>
                  </div>
                </li>
                <li>
                  <b>02</b>
                  <div>
                    <strong>Collect</strong>
                    <span>Speed, Focus &amp; Flow unlock your shot</span>
                  </div>
                </li>
                <li>
                  <b>03</b>
                  <div>
                    <strong>Time it</strong>
                    <span>{touch ? "Hold SHOOT" : "Hold SPACE"}, release in the orange band</span>
                  </div>
                </li>
              </ol>
              <button className="cta" onClick={() => handleRef.current?.restart()}>
                START SESSION <span>→</span>
              </button>
              <div className="microcopy">
                {touch ? "Tap to start" : "Press SPACE or ENTER to start"}
                {state.best > 0 && <> · Best {state.best.toLocaleString()}</>}
              </div>
            </div>
          ) : (
            <div className="panel results-panel">
              <div className="eyebrow accent">SESSION COMPLETE</div>
              <div className="rank">{rankFor(state.score).rank}</div>
              <p className="lede">{rankFor(state.score).note}</p>
              <div className="final-score">
                <span className="eyebrow">FINAL SCORE</span>
                <strong>{state.score.toLocaleString()}</strong>
                {state.newBest && <em>NEW PERSONAL BEST</em>}
              </div>
              <div className="stat-grid">
                <div>
                  <strong>
                    {state.makes}/{state.shots}
                  </strong>
                  <span>MAKES</span>
                </div>
                <div>
                  <strong>{accuracy}%</strong>
                  <span>ACCURACY</span>
                </div>
                <div>
                  <strong>{state.perfects}</strong>
                  <span>PERFECT</span>
                </div>
                <div>
                  <strong>x{state.bestCombo}</strong>
                  <span>BEST STREAK</span>
                </div>
              </div>
              <button className="cta" onClick={() => handleRef.current?.restart()}>
                RUN IT BACK <span>↻</span>
              </button>
              <div className="microcopy">{touch ? "Tap to replay" : "R / ENTER to replay"} · Best {state.best.toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="loader">
          <div className="loader-ball" />
          <span className="eyebrow">WARMING UP THE GYM…</span>
        </div>
      )}
    </main>
  );
}

function TouchControls({ handle, charging }: { handle: React.RefObject<GameHandle | null>; charging: boolean }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);

  const update = (e: RPointerEvent<HTMLDivElement>) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
    handle.current?.setMove(dx / max, -dy / max);
  };
  const end = () => {
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    handle.current?.setMove(0, 0);
  };

  return (
    <>
      <div
        ref={baseRef}
        className="joystick"
        onPointerDown={(e) => {
          activeId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e);
        }}
        onPointerMove={(e) => activeId.current === e.pointerId && update(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        className={`shoot-btn ${charging ? "active" : ""}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handle.current?.shootDown();
        }}
        onPointerUp={() => handle.current?.shootUp()}
        onPointerCancel={() => handle.current?.shootUp()}
        onContextMenu={(e) => e.preventDefault()}
      >
        SHOOT
      </button>
    </>
  );
}
