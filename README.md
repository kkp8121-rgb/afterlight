# AFTERLIGHT

AFTERLIGHT is a small, dependency-free browser game about a lamplighter restoring a drowned observatory. Walk across the memories you leave behind: press rewind to turn the last three seconds of your path into luminous one-way platforms.

## Play

Use **A/D** or **Left/Right** to move. Use **Space**, **W**, or **Up** to jump; hold the key for a higher jump. Use **E** or **X** to rewind and solidify your recorded path. **S** or **Down** drops through memory platforms. **R** restarts the room, **Escape/P** pauses, and **M** mutes audio. **Enter** begins, advances to the next chamber, or replays the campaign. Touch controls are available on landscape phones.

Collect every light seed, then touch the doorway. Echo platforms last 14 seconds and the tape refills after each rewind. Falling or touching a hazard respawns you in the current chamber after a short pause. There are no lives or global time limit.

## Run locally

The game uses classic browser scripts and makes no network requests during play. Double-click `index.html` to play directly with `file://` in a browser that allows local canvas and audio. A local server is useful for browser testing and serves subdirectory paths as well:

```text
npm install
npm run serve
```

Then open `http://localhost:4173/` or `http://localhost:4173/afterlight/`. The server listens on port 4173 by default; set `PORT` to choose another port.

## Build a web archive

```text
npm run pack
```

This writes `dist/afterlight-web.zip` using the platform's built-in archive utility. The archive contains the playable web files and no runtime packages.

The fresh package check produced a 25,106-byte ZIP with 9 portable relative entries. `artifacts/package-verify.json` records a streaming SHA-256 comparison for every entry; all entries matched their source files.

Progress, best time, mute, and reduced-motion preferences are stored locally in the browser. No account or network service is required.

## Verify

Run `npm install` and `npx playwright install chromium` once, then `npm run test:all`. Tests use headless Chromium only. The fresh core run passed 6/6 engine tests; the fresh browser and interaction runs passed the file/subpath smoke checks and all 8 interaction scenarios, including keyboard/touch held-source aggregation and release, pause, persistence, storage fallback, and portrait/small-landscape layout checks. During play, the afterimage hint is shown only while a live echo exists, and collecting every seed changes the hint to the doorway objective. The earlier all-eight-chamber campaign report is retained as historical evidence from the previous release; the current packet's fresh checks are the focused physical/UI regressions above. The final performance check also measures a full memory path at 6× CPU throttling. Local evidence is written to the ignored `artifacts/` folder.

An additional fresh probe verified that an expired echo restores the creation hint and that releasing D does not cancel a held ArrowRight. Evidence: `artifacts/root-hint-alias.json`.

Play at https://kkp8121-rgb.github.io/afterlight/. Publication evidence is generated separately in `artifacts/improvement-publication.json` after verifying the deployed commit, runtime asset hashes and headless startup.
