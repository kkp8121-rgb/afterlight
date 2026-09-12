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

Progress, best time, mute, and reduced-motion preferences are stored locally in the browser. No account or network service is required.

## Verify

Run `npm install` and `npx playwright install chromium` once, then `npm run test:all`. Tests use headless Chromium only. They cover physical rewind collisions, all eight chamber solutions, actual keyboard campaign play through the ending, saved progress, audio activation, touch input, responsive layouts, local files, and a Pages subdirectory. The final performance check also measures a full memory path at 6× CPU throttling. Local evidence is written to the ignored `artifacts/` folder.
