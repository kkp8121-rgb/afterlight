(function () {
  'use strict';

  var FIXED_STEP = 1 / 120;
  var MAX_FRAME_SECONDS = 0.25;
  var MAX_STEPS_PER_FRAME = 30;
  var RESPAWN_DELAY = window.AL && window.AL.tuning && Number(window.AL.tuning.respawnDelay) > 0
    ? Number(window.AL.tuning.respawnDelay) : 0.65;
  var PROGRESS_KEY = 'afterlight.progress.v1';
  var SETTINGS_KEY = 'afterlight.settings.v1';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(function () {
    var ids = [
      'game', 'title-screen', 'start-button', 'continue-button', 'pause-screen', 'resume-button',
      'restart-button', 'menu-button', 'complete-screen', 'next-button', 'ending-screen',
      'replay-button', 'level-number', 'level-name', 'seed-count', 'tape-fill', 'echo-readout',
      'hint', 'run-time', 'mute-button', 'motion-button', 'pause-button', 'complete-title',
      'complete-copy', 'ending-copy', 'ending-stats'
    ];
    var el = {};
    ids.forEach(function (id) { el[id] = document.getElementById(id); });

    var engine = window.AfterlightEngine;
    var levels = window.AL && Array.isArray(window.AL.levels) ? window.AL.levels : [];
    var canvas = el.game;
    var renderer = canvas && window.AfterlightRenderer ? new window.AfterlightRenderer(canvas) : null;
    var audio = window.AfterlightAudio ? new window.AfterlightAudio() : null;
    var progress = readJson(PROGRESS_KEY, { nextLevel: 0, completed: false, bestTime: null, runTime: 0, deaths: 0, rewinds: 0 });
    var settings = readJson(SETTINGS_KEY, { muted: false, reducedMotion: false });
    var mode = 'title';
    var state = engine && levels.length ? engine.create(0) : null;
    var levelIndex = 0;
    var runTime = 0;
    var deathCount = 0;
    var totalRewinds = 0;
    var deathWait = 0;
    var pendingEvents = [];
    var accumulator = 0;
    var previousFrame = 0;
    var wallTime = 0;
    var lastRenderedMode = '';
    var autoPaused = false;
    var held = Object.create(null);
    var pressed = { jump: false, rewind: false };
    var hintMessage = '';
    var hintMessageUntil = 0;

    function readJson(key, fallback) {
      try {
        var raw = window.localStorage && window.localStorage.getItem(key);
        if (!raw) return fallback;
        var value = JSON.parse(raw);
        return value && typeof value === 'object' ? value : fallback;
      } catch (_) {
        return fallback;
      }
    }

    function writeJson(key, value) {
      try {
        if (window.localStorage) window.localStorage.setItem(key, JSON.stringify(value));
      } catch (_) { /* file:// and private storage may deny writes */ }
    }

    function clearInputs() {
      held = Object.create(null);
      pressed.jump = false;
      pressed.rewind = false;
      var controls = document.querySelectorAll('[data-control]');
      for (var i = 0; i < controls.length; i++) controls[i].classList.remove('is-held');
    }

    function setMode(next) {
      mode = next;
      clearInputs();
      if (next === 'playing' && document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      if (renderer && typeof renderer.reset === 'function' && lastRenderedMode !== next) renderer.reset();
      lastRenderedMode = next;
      updateScreens();
    }

    function formatTime(seconds) {
      seconds = Math.max(0, Number(seconds) || 0);
      var minutes = Math.floor(seconds / 60);
      var remainder = seconds - minutes * 60;
      return String(minutes).padStart(2, '0') + ':' + remainder.toFixed(2).padStart(5, '0');
    }

    function currentLevel() {
      return state && state.level ? state.level : levels[levelIndex];
    }

    function collectedCount() {
      if (!state || !Array.isArray(state.collected)) return 0;
      var count = 0;
      for (var i = 0; i < state.collected.length; i++) if (state.collected[i]) count++;
      return count;
    }

    function updateScreens() {
      toggle(el['title-screen'], mode === 'title');
      toggle(el['pause-screen'], mode === 'paused');
      toggle(el['complete-screen'], mode === 'room-complete');
      toggle(el['ending-screen'], mode === 'ending');
      if (el['continue-button']) toggle(el['continue-button'], progress.nextLevel > 0 && !progress.completed);
      if (document.body) document.body.dataset.mode = mode;
      updateHud();
    }

    function toggle(node, visible) {
      if (!node) return;
      node.classList.toggle('hidden', !visible);
      node.setAttribute('aria-hidden', String(!visible));
    }

    function updateHud() {
      var level = currentLevel();
      if (el['level-number']) el['level-number'].textContent = state ? String(levelIndex + 1).padStart(2, '0') : '';
      if (el['level-name']) el['level-name'].textContent = level && level.name ? level.name : '';
      if (el['seed-count']) el['seed-count'].textContent = state ? collectedCount() + ' / ' + ((level && level.seeds) || []).length : '';
      if (el['tape-fill']) el['tape-fill'].style.width = state ? Math.round(Math.max(0, Math.min(1, Number(state.tapeRatio) || 0)) * 100) + '%' : '0%';
      if (el['echo-readout']) {
        var historySpan = state && Array.isArray(state.history) && state.history.length > 1
          ? state.history[state.history.length - 1].t - state.history[0].t : 0;
        var tapeMinimum = window.AL && window.AL.tuning ? Number(window.AL.tuning.tapeMinimumSeconds) || 0 : 0;
        var echo = state && Number(state.echoRemaining) > 0 ? Math.ceil(state.echoRemaining) + 's'
          : historySpan < tapeMinimum ? 'RECORDING' : 'READY';
        el['echo-readout'].textContent = echo;
      }
      if (el['hint']) el['hint'].textContent = hintText(level);
      if (el['run-time']) el['run-time'].textContent = formatTime(runTime);
      if (el['mute-button']) {
        el['mute-button'].textContent = settings.muted ? 'SOUND OFF' : 'SOUND ON';
        el['mute-button'].setAttribute('aria-pressed', String(!!settings.muted));
      }
      if (el['motion-button']) {
        el['motion-button'].textContent = settings.reducedMotion ? 'MOTION LESS' : 'MOTION ON';
        el['motion-button'].setAttribute('aria-pressed', String(!!settings.reducedMotion));
      }
      if (el['complete-title']) el['complete-title'].textContent = level && level.name ? level.name : 'Chamber complete';
      if (el['complete-copy']) {
        var subtitle = level && level.subtitle ? level.subtitle + '. ' : '';
        el['complete-copy'].textContent = subtitle + (levelIndex + 1) + ' of ' + levels.length + ' lights restored.';
      }
      if (el['ending-copy']) el['ending-copy'].textContent = 'The observatory wakes. What you left behind has become the way home.';
      if (el['ending-stats']) {
        var best = progress.bestTime == null ? '—' : formatTime(progress.bestTime);
        el['ending-stats'].textContent = 'Run time  ' + formatTime(runTime) + '   ·   Best time  ' + best + '   ·   Rewinds  ' + totalRewinds + '   ·   Deaths  ' + deathCount;
      }
    }

    function hintText(level) {
      if (!level) return '';
      if (hintMessage && wallTime < hintMessageUntil) return hintMessage;
      if (levelIndex === 0 && state) {
        var totalSeeds = Array.isArray(state.collected) ? state.collected.length : 0;
        var foundSeeds = collectedCount();
        if (totalSeeds > 0 && foundSeeds >= totalSeeds) return 'All light gathered. Enter the glowing doorway.';
        if (state.rewinds > 0 || (Array.isArray(state.echo) && state.echo.length > 0)) {
          return 'Jump onto the warm afterimage. Jump again to reach the higher ledge.';
        }
        return 'Hold SPACE for a high jump near the tall ledge. Press E near the top.';
      }
      return level.hint || '';
    }

    function setHintMessage(text) {
      hintMessage = text;
      hintMessageUntil = wallTime + 2.5;
      updateHud();
    }

    function playerTouches(rect) {
      if (!state || !state.player || !rect) return false;
      var p = state.player;
      return p.x < rect.x + rect.w && p.x + p.w > rect.x && p.y < rect.y + rect.h && p.y + p.h > rect.y;
    }

    function unlockAudio() {
      if (!audio || typeof audio.unlock !== 'function') return;
      try {
        var result = audio.unlock();
        if (result && typeof result.catch === 'function') result.catch(function () {});
      } catch (_) {}
    }

    function setMuted(value) {
      settings.muted = !!value;
      writeJson(SETTINGS_KEY, settings);
      if (audio && typeof audio.setMuted === 'function') {
        try { audio.setMuted(settings.muted); } catch (_) {}
      }
      updateHud();
    }

    function setReducedMotion(value) {
      settings.reducedMotion = !!value;
      writeJson(SETTINGS_KEY, settings);
      updateHud();
    }

    function resetState(index) {
      levelIndex = Math.max(0, Math.min(levels.length - 1, index | 0));
      state = engine.create(levelIndex);
      deathWait = 0;
      pendingEvents.length = 0;
      hintMessage = '';
      hintMessageUntil = 0;
      if (state && Array.isArray(state.events)) state.events.length = 0;
      updateHud();
    }

    function beginRun(index, initialTime, initialStats) {
      if (!engine || !levels.length) return;
      unlockAudio();
      runTime = Number(initialTime) > 0 ? Number(initialTime) : 0;
      deathCount = initialStats && Number(initialStats.deaths) > 0 ? Number(initialStats.deaths) : 0;
      totalRewinds = initialStats && Number(initialStats.rewinds) > 0 ? Number(initialStats.rewinds) : 0;
      if (index === 0 && !initialStats) {
        progress = { nextLevel: 0, completed: false, bestTime: progress.bestTime == null ? null : progress.bestTime, runTime: 0, deaths: 0, rewinds: 0 };
        writeJson(PROGRESS_KEY, progress);
      }
      resetState(index);
      setMode('playing');
    }

    function restartRoom() {
      if ((mode !== 'playing' && mode !== 'paused') || !state) return;
      unlockAudio();
      resetState(levelIndex);
      setMode('playing');
    }

    function saveProgress(completedIndex, finished) {
      var nextLevel = Math.min(levels.length, completedIndex + 1);
      var next = {
        nextLevel: nextLevel,
        completed: !!finished,
        bestTime: progress.bestTime,
        runTime: runTime,
        deaths: deathCount,
        rewinds: totalRewinds
      };
      if (finished && (next.bestTime == null || runTime < next.bestTime)) next.bestTime = runTime;
      progress = next;
      writeJson(PROGRESS_KEY, progress);
    }

    function completeRoom() {
      clearInputs();
      saveProgress(levelIndex, levelIndex >= levels.length - 1);
      if (levelIndex >= levels.length - 1) setMode('ending');
      else setMode('room-complete');
    }

    function nextRoom() {
      if (mode !== 'room-complete') return;
      unlockAudio();
      resetState(levelIndex + 1);
      setMode('playing');
    }

    function showTitle() {
      progress = readJson(PROGRESS_KEY, progress);
      resetState(0);
      runTime = 0;
      setMode('title');
    }

    function continueRun() {
      var next = Number(progress.nextLevel);
      if (!Number.isFinite(next) || next <= 0 || next >= levels.length || progress.completed) return;
      beginRun(next, progress.runTime, progress);
    }

    function pauseGame(auto) {
      if (mode !== 'playing') return;
      autoPaused = !!auto;
      setMode('paused');
    }

    function resumeGame() {
      if (mode !== 'paused') return;
      autoPaused = false;
      unlockAudio();
      setMode('playing');
    }

    function inspectSnapshot() {
      if (!state) return null;
      var levelCopy;
      try { levelCopy = JSON.parse(JSON.stringify(state.level)); } catch (_) { levelCopy = null; }
      var copy = {
        levelIndex: levelIndex,
        level: levelCopy,
        player: state.player && {
          x: state.player.x, y: state.player.y, w: state.player.w, h: state.player.h,
          vx: state.player.vx, vy: state.player.vy, onGround: state.player.onGround, facing: state.player.facing
        },
        elapsed: state.elapsed,
        history: Array.isArray(state.history) ? state.history.map(function (p) { return { x: p.x, y: p.y, t: p.t }; }) : [],
        echo: Array.isArray(state.echo) ? state.echo.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; }) : [],
        echoRemaining: state.echoRemaining,
        tapeRatio: state.tapeRatio,
        collected: Array.isArray(state.collected) ? state.collected.slice() : [],
        status: state.status,
        events: Array.isArray(state.events) ? state.events.map(function (event) { return { type: event.type, x: event.x, y: event.y }; }) : [],
        rewinds: state.rewinds,
        deathReason: state.deathReason
      };
      return copy;
    }

    function inspectStats() {
      return {
        levelIndex: levelIndex,
        rooms: levels.length,
        runTime: runTime,
        bestTime: progress.bestTime == null ? null : progress.bestTime,
        completed: !!progress.completed,
        deaths: deathCount,
        rewinds: totalRewinds
      };
    }

    function interactiveTarget(target) {
      return !!(target && target.closest && target.closest('button, a, input, select, textarea, [contenteditable="true"]'));
    }

    function keyName(event) {
      return String(event.key || '').toLowerCase();
    }

    function onKeyDown(event) {
      var key = keyName(event);
      var interactive = interactiveTarget(event.target);
      if (key === 'm' && !event.repeat) { setMuted(!settings.muted); return; }
      if (key === 'escape' || key === 'p') {
        if (!event.repeat) {
          if (mode === 'playing') pauseGame(false);
          else if (mode === 'paused') resumeGame();
          event.preventDefault();
        }
        return;
      }
      if (key === 'enter' && !interactive && !event.repeat) {
        if (mode === 'title') beginRun(0);
        else if (mode === 'room-complete') nextRoom();
        else if (mode === 'ending') beginRun(0);
        event.preventDefault();
        return;
      }
      if (interactive || mode !== 'playing') return;

      var action = null;
      if (key === 'a' || key === 'arrowleft') action = 'left';
      else if (key === 'd' || key === 'arrowright') action = 'right';
      else if (key === 's' || key === 'arrowdown') action = 'down';
      else if (key === ' ' || key === 'w' || key === 'arrowup') action = 'jump';
      else if (key === 'e' || key === 'x') action = 'rewind';
      else if (key === 'r') { if (!event.repeat) restartRoom(); event.preventDefault(); return; }
      if (!action) return;
      if (action === 'jump' && !event.repeat) pressed.jump = true;
      if (action === 'rewind' && !event.repeat) pressed.rewind = true;
      held[action] = true;
      event.preventDefault();
      unlockAudio();
    }

    function onKeyUp(event) {
      var key = keyName(event);
      var action = null;
      if (key === 'a' || key === 'arrowleft') action = 'left';
      else if (key === 'd' || key === 'arrowright') action = 'right';
      else if (key === 's' || key === 'arrowdown') action = 'down';
      else if (key === ' ' || key === 'w' || key === 'arrowup') action = 'jump';
      else if (key === 'e' || key === 'x') action = 'rewind';
      if (action) delete held[action];
    }

    function bindTouch() {
      var controls = document.querySelectorAll('[data-control]');
      for (var i = 0; i < controls.length; i++) {
        (function (button) {
          var action = button.getAttribute('data-control');
          function down(event) {
            if (mode !== 'playing') return;
            event.preventDefault();
            held[action] = true;
            if (action === 'jump') pressed.jump = true;
            if (action === 'rewind') pressed.rewind = true;
            button.classList.add('is-held');
            if (button.setPointerCapture && event.pointerId != null) {
              try { button.setPointerCapture(event.pointerId); } catch (_) {}
            }
            unlockAudio();
          }
          function up(event) {
            event.preventDefault();
            delete held[action];
            button.classList.remove('is-held');
          }
          button.addEventListener('pointerdown', down, { passive: false });
          button.addEventListener('pointerup', up, { passive: false });
          button.addEventListener('pointercancel', up, { passive: false });
          button.addEventListener('lostpointercapture', up, { passive: false });
          button.addEventListener('contextmenu', function (event) { event.preventDefault(); });
        })(controls[i]);
      }
    }

    function bindButton(node, handler) {
      if (!node) return;
      node.addEventListener('click', function (event) {
        event.preventDefault();
        handler();
      });
    }

    function simulate() {
      if (mode !== 'playing' || !state || !engine) return;
      if (state.status === 'dead') {
        deathWait += FIXED_STEP;
        if (deathWait >= RESPAWN_DELAY) restartRoom();
        return;
      }
      if (state.status === 'complete') { completeRoom(); return; }
      var input = {
        axis: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        jump: pressed.jump,
        jumpHeld: !!held.jump,
        rewind: pressed.rewind,
        down: !!held.down
      };
      pressed.jump = false;
      pressed.rewind = false;
      var result = engine.step(state, input, FIXED_STEP) || state;
      state = result;
      var events = Array.isArray(state.events) ? state.events.slice() : [];
      if (Array.isArray(state.events)) state.events.length = 0;
      for (var i = 0; i < events.length; i++) {
        pendingEvents.push(events[i]);
        if (events[i].type === 'death') { deathWait = 0; deathCount++; clearInputs(); }
        if (events[i].type === 'rewind') totalRewinds++;
        if (events[i].type === 'denied') {
          var roomExit = state.level && state.level.exit;
          if (roomExit && playerTouches(roomExit) && collectedCount() < state.collected.length) {
            setHintMessage('Gather every light seed before entering the doorway.');
          } else {
            setHintMessage('Keep recording for a moment longer, then press E.');
          }
        }
        if (events[i].type === 'complete') completeRoom();
      }
      if (state.status === 'dead') deathWait = 0;
      else if (mode === 'playing' && state.status === 'playing') runTime += FIXED_STEP;
      updateHud();
    }

    function render(frameSeconds) {
      if (!renderer || !state) return;
      state.events = pendingEvents.splice(0, pendingEvents.length);
      renderer.draw(state, { time: wallTime, dt: frameSeconds, mode: mode, reducedMotion: !!settings.reducedMotion });
      var renderedEvents = state.events.slice();
      state.events.length = 0;
      if (audio) {
        for (var i = 0; i < renderedEvents.length; i++) {
          if (typeof audio.event === 'function') {
            try { audio.event(renderedEvents[i].type); } catch (_) {}
          }
        }
        if (mode === 'playing' && typeof audio.update === 'function') {
          try { audio.update(state, frameSeconds); } catch (_) {}
        }
      }
    }

    function frame(now) {
      if (!previousFrame) previousFrame = now;
      var frameSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - previousFrame) / 1000));
      previousFrame = now;
      wallTime += frameSeconds;
      if (mode === 'playing') {
        accumulator = Math.min(MAX_FRAME_SECONDS, accumulator + frameSeconds);
        var steps = 0;
        while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
          simulate();
          accumulator -= FIXED_STEP;
          steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
      } else {
        accumulator = 0;
      }
      render(frameSeconds);
      requestAnimationFrame(frame);
    }

    document.addEventListener('keydown', onKeyDown, { passive: false });
    document.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', function () { if (mode === 'playing') pauseGame(true); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'playing') pauseGame(true); });

    bindButton(el['start-button'], function () { beginRun(0); });
    bindButton(el['continue-button'], continueRun);
    bindButton(el['resume-button'], resumeGame);
    bindButton(el['restart-button'], restartRoom);
    bindButton(el['menu-button'], showTitle);
    bindButton(el['next-button'], nextRoom);
    bindButton(el['replay-button'], function () { beginRun(0); });
    bindButton(el['pause-button'], function () { pauseGame(false); });
    bindButton(el['mute-button'], function () { setMuted(!settings.muted); });
    bindButton(el['motion-button'], function () { setReducedMotion(!settings.reducedMotion); });
    bindTouch();

    if (audio && typeof audio.setMuted === 'function') {
      try { audio.setMuted(settings.muted); } catch (_) {}
    }
    updateScreens();
    window.afterlight = {
      get state() { return inspectSnapshot(); },
      get mode() { return mode; },
      get stats() { return inspectStats(); }
    };
    requestAnimationFrame(frame);
  });
})();
