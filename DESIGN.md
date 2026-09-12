# AFTERLIGHT — Walk on what you leave behind

## Decision

Compared a rhythm rail racer (timed lane changes, pursuit), gravity-swapping puzzle chambers (binary inversion), a time-debt deckbuilder (turn-based resource economy), and a memory-building platformer (physical spatial authorship). Choose the last: an immediately visible impossible act, expressive keyboard control, and layered puzzles from one rule. Build a complete 8-chamber campaign, roughly 5–10 minutes on a first play, with a quiet ending and optional best-time replay. No claim of jam eligibility or a real award.

Theme: things lost can hold us up. Player fantasy: the last lamplighter restoring a drowned observatory by walking on crystallized memories.

Hook: rewind the last three seconds; the path you leave behind becomes solid light.

## Design and controls

A/D or Left/Right move. Space/W/Up jump (variable height). E or X rewinds and solidifies the recorded foot-path. Down/S drops through memory platforms. R restarts the room. Escape/P pauses. M mutes. Enter confirms start/next/replay.

Real platforms are solid rectangles; echo platforms are one-way luminous planks. Record up to 3 seconds of position, including jumps. Rewind returns to the oldest recorded position, replacing the old echo with this path. Echo lasts 14 seconds. Tape then refills immediately. No consumable lives. Death restarts only the current room. Collect all light seeds and reach the doorway. The first room makes a jump's afterimage the step to a ledge above normal jump height. Subsequent rooms teach crossing, chains, dropping through, moving hazards, and a final synthesis. Keep early rooms generous and offer contextual hints. Echo duration is visible; no global time limit.

Visual: cinematic 2D side view, fixed single-screen chambers, 960×540 logical world. Deep midnight navy, pale mint light, warm apricot memory paths, copper accents, immense drowned arches, moon and dust. Avoid a generic neon arena. Original procedural art: layered architecture, waterline and reflections, scarfed small lamplighter with lantern, animated seed blooms, warm trail fragments. Soft grain/stars, strong silhouette and restrained typography. First screen is an atmospheric title with a real animated scene, a striking title, hook, three key instructions, and one Begin button. HUD sits outside the world canvas. Gameplay must be legible and visually rich. English game copy; Korean delivery to user.

Audio: original procedural ambient music with sparse glass/soft synth chords, jump, land, rewind, seed, death, door sounds. Start only after user gesture; mute persists. Reduced motion option persists. Mobile landscape touch buttons are secondary, keyboard is primary. Canvas scales without cropping.

## Frozen interface contract (root-owned)

Scripts in order: levels.js, engine.js, renderer.js, audio.js, game.js. Classic scripts, globals on window/globalThis. No network requests required to play.

`window.AL = { width:960, height:540, tuning:{...}, levels:[...] }` is defined by levels.js. Levels: `{id, name, subtitle, hint, spawn:{x,y}, platforms:[{x,y,w,h}], seeds:[{x,y}], exit:{x,y,w,h}, hazards:[{x,y,w,h,axis:'x'|'y',range,period,phase}], decor:{chapter,moon}}`. Coordinates are pixels; x/y are top-left for all rectangles and player; seeds use centers. Static hazards use range:0. Engine defaults missing hazard motion fields. `decor` optional.

`window.AfterlightEngine = {create, step, hazardRect}` also exports using `module.exports` in Node for tests. `create(index)` returns state. `step(state,input,dt)` mutates and returns state; dt is seconds with nominal 1/120. input `{axis, jump, jumpHeld, rewind, down}`; jump/rewind are edge presses. A step clears state.events and emits events as `{type,x,y}` with types jump, land, rewind, seed, death, complete, denied. `hazardRect(hazard, elapsed)` returns current `{x,y,w,h}`.

State: `{levelIndex, level, player:{x,y,w,h,vx,vy,onGround,facing}, elapsed, history:[{x,y,t}], echo:[{x,y,w,h}], echoRemaining, tapeRatio, collected:[boolean], status:'playing'|'dead'|'complete', events:[], rewinds, deathReason}`. history x/y are player TOP-LEFT at that time. Echo tops are prior player FEET. State exposes actual simulation values for meaningful testing; no game-completion cheats. Engine simulates collision, tape, seeds, hazards, void death, exit completion. No DOM/render/audio work in engine. Clamp horizontal world bounds. Core handles coyote time, buffered jumping, variable jump height and landing feedback. `create()` must be isolated and deterministic. Complete requires all seeds and player rectangle touching exit. Echo must be a useful landing surface; old echo replacement must not teleport player inside geometry. Keep ample margin in collision.

`window.AfterlightRenderer = class { constructor(canvas); draw(state, view); }`. Draw uses canvas 960×540 logical coordinates independent of CSS/DPR. `view={time,dt,mode:'title'|'playing'|'paused'|'room-complete'|'ending',reducedMotion}`. Renderer detects state.events once per draw only (app clears after draw), contains its own particles, camera feedback, trails. For title draw a valid state with animation, behind HTML overlay. No input binding or DOM creation. Render hazard geometry with engine.hazardRect; display seeds according to collected. World only: external HUD and all menus are app-owned. Optional renderer `reset()` for transitions.

`window.AfterlightAudio = class { constructor(); unlock(); setMuted(boolean); event(type); update(state,dt); }`. All methods safe before unlock. Expose `context` for validation; no unhandled promises. App calls unlock during actual gesture. Audio has gentle sustained ambience and distinctive rewind chord. update can start/pulse ambience on musical intervals. App stops advancing audio sequencing when paused; mute suppresses everything. Web Audio failures leave game playable.

HTML structure owned by presentation worker, fixed IDs expected by game.js: `#game` canvas; `#title-screen`, `#start-button`, `#continue-button` (hidden by default), `#pause-screen`, `#resume-button`, `#restart-button`, `#menu-button`, `#complete-screen`, `#next-button`, `#ending-screen`, `#replay-button`; `#level-number`, `#level-name`, `#seed-count`, `#tape-fill`, `#echo-readout`, `#hint`, `#run-time`, `#mute-button`, `#motion-button`, `#pause-button`; `#complete-title`, `#complete-copy`, `#ending-stats`. Screens use .hidden (`display:none!important`). Controls use `[data-control='left'|'right'|'jump'|'rewind'|'down']` for touch. Title includes keyboard legend and hook; other overlays have clear text and buttons. Main contains HUD, world canvas with overlays in .stage, and footer hint/control strip. App uses textContent and style.width for updates. Buttons accessible and focus-visible. CSS must fit desktop and landscape phone with safe areas.

App owns game loop (fixed 1/120 accumulator capped), input pressed vs held, UI transitions, room counters, automatic respawn after 0.65 s, campaign progress/best time localStorage (safe on file://), pause on window blur/visibility, touch capture release, R restart, M mute, reduced motion. Next room is explicit after completion, Enter supported. Ending after eighth room. Time counts playing simulation only. Expose read-only inspection via `window.afterlight = {get state(),get mode(),get stats()}`. No hidden level skips or teleport API. Root tests can use pure engine to solve and actual input events in headless browser for integration.

## Ownership

- Core executor: engine.js, levels.js only, plus tests/engine.test.cjs if useful.
- Presentation executor: index.html, style.css, renderer.js, audio.js, favicon.svg only.
- App executor: game.js, package.json, .gitignore, .nojekyll, README.md, tools/server.cjs, tools/pack.cjs only.
- Root: DESIGN.md, AGENTS.md, test/playthrough tools, artifacts, integration, Git and deployment.

All executors report files, actual checks, open risks. No agent commits or pushes. No descendants. Root inspects every diff and runs fresh checks.
