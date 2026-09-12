(function (root) {
  'use strict';

  var AL = root.AL;
  if (!AL && typeof require === 'function') AL = require('./levels.js');
  if (!AL) throw new Error('AFTERLIGHT levels.js must load before engine.js');

  var T = AL.tuning;
  var TAU = Math.PI * 2;

  function copy(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function overlap(a0, a1, b0, b1) { return a0 < b1 - T.collisionEpsilon && a1 > b0 + T.collisionEpsilon; }
  function intersects(a, b) {
    return overlap(a.x, a.x + a.w, b.x, b.x + b.w) && overlap(a.y, a.y + a.h, b.y, b.y + b.h);
  }
  function playerRect(state) {
    var p = state.player;
    return { x: p.x, y: p.y, w: p.w, h: p.h };
  }
  function emit(state, type, x, y) {
    state.events.push({ type: type, x: x == null ? state.player.x : x, y: y == null ? state.player.y : y });
  }
  function horizontalOverlap(player, platform) {
    return overlap(player.x, player.x + player.w, platform.x, platform.x + platform.w);
  }

  function hazardRect(hazard, elapsed) {
    var h = hazard || {};
    var x = Number(h.x) || 0;
    var y = Number(h.y) || 0;
    var range = Number(h.range) || 0;
    var period = Number(h.period) > 0 ? Number(h.period) : 3;
    var phase = Number(h.phase) || 0;
    var offset = Math.sin((elapsed / period) * TAU + phase) * range;
    if (h.axis === 'y') y += offset;
    else if (h.axis === 'x') x += offset;
    return { x: x, y: y, w: Number(h.w) || 0, h: Number(h.h) || 0 };
  }

  function echoSurface(state, item) {
    return { x: item.x, y: item.y, w: item.w, h: item.h, echo: true };
  }

  function solidSurfaces(state) {
    return state.level.platforms || [];
  }

  function isDropSupport(state) {
    var p = state.player;
    if (state._dropTimer > 0) return true;
    // Real ledges remain solid even when an older footpath is painted over them.
    // Down only drops through memory, never through the room geometry.
    var platforms = solidSurfaces(state);
    for (var s = 0; s < platforms.length; s++) {
      if (Math.abs(p.y + p.h - platforms[s].y) <= T.supportTolerance && horizontalOverlap(p, platforms[s])) return false;
    }
    for (var i = 0; i < state.echo.length; i++) {
      var e = state.echo[i];
      if (Math.abs(p.y + p.h - e.y) <= T.echoSupportTolerance && horizontalOverlap(p, e)) return true;
    }
    return false;
  }

  function overlapsSolidAt(state, x, y) {
    var p = state.player;
    var test = { x: x, y: y, w: p.w, h: p.h };
    for (var i = 0; i < solidSurfaces(state).length; i++) {
      if (intersects(test, solidSurfaces(state)[i])) return true;
    }
    return false;
  }

  function safeRewindPosition(state, sample) {
    var p = state.player;
    var x = clamp(sample.x, 0, AL.width - p.w);
    var y = sample.y;
    // Recorded positions are normally already valid. This small correction protects
    // against a platform being edited while a replay is in progress.
    if (overlapsSolidAt(state, x, y)) {
      var floor = y;
      for (var i = 1; i <= T.rewindSafetyIterations && overlapsSolidAt(state, x, floor); i++) floor = y - i * T.rewindSafetyStep;
      y = floor;
    }
    return { x: x, y: y };
  }

  function makeEcho(state) {
    var p = state.player;
    var pad = T.echoPadding;
    var result = [];
    for (var i = 0; i < state.history.length; i++) {
      var sample = state.history[i];
      result.push({
        x: clamp(sample.x - pad * 0.5, 0, AL.width - p.w - pad),
        y: sample.y + p.h,
        w: p.w + pad,
        h: T.echoHeight
      });
    }
    return result;
  }

  function rewind(state) {
    var span = state.history.length ? state.history[state.history.length - 1].t - state.history[0].t : 0;
    if (span < T.tapeMinimumSeconds || state.history.length < 2) {
      emit(state, 'denied');
      return false;
    }
    var first = state.history[0];
    var path = makeEcho(state);
    var pos = safeRewindPosition(state, first);
    state.echo = path;
    state.echoRemaining = T.echoSeconds;
    state.player.x = pos.x;
    state.player.y = pos.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.onGround = false;
    state.history = [{ x: pos.x, y: pos.y, t: state.elapsed }];
    state.tapeRatio = 0;
    state._coyote = 0;
    state._jumpBuffer = 0;
    state._dropTimer = 0;
    state.rewinds += 1;
    emit(state, 'rewind', pos.x, pos.y);
    return true;
  }

  function updateHistory(state) {
    var p = state.player;
    var last = state.history[state.history.length - 1];
    if (!last || state.elapsed - last.t >= T.historySampleSeconds * T.historySampleFactor) {
      state.history.push({ x: p.x, y: p.y, t: state.elapsed });
    }
    var oldest = state.elapsed - T.tapeSeconds;
    while (state.history.length > 1 && state.history[0].t < oldest) state.history.shift();
    var first = state.history[0];
    var span = state.elapsed - first.t;
    state.tapeRatio = clamp(span / T.tapeSeconds, 0, 1);
  }

  function moveHorizontal(state, dt) {
    var p = state.player;
    var axis = clamp(Number(state._inputAxis) || 0, -1, 1);
    var target = axis * T.moveSpeed;
    var rate = axis === 0 ? T.moveFriction : T.moveAcceleration;
    var delta = clamp(target - p.vx, -rate * dt, rate * dt);
    p.vx += delta;
    if (Math.abs(p.vx) < T.velocityEpsilon) p.vx = 0;
    if (axis) p.facing = axis < 0 ? -1 : 1;
    var oldX = p.x;
    p.x = clamp(p.x + p.vx * dt, 0, AL.width - p.w);
    if (p.x === 0 || p.x === AL.width - p.w) p.vx = 0;
    var platforms = solidSurfaces(state);
    for (var i = 0; i < platforms.length; i++) {
      var platform = platforms[i];
      if (!overlap(p.y + 2, p.y + p.h - 2, platform.y, platform.y + platform.h)) continue;
      // A recorded plank can sit a few pixels below a real ledge. Let the
      // vertical solver promote the player onto that ledge instead of making
      // the shared edge behave like a wall.
      if (!intersects(p, platform)) continue;
      if (p.y + p.h <= platform.y + T.landingTolerance && p.vx !== 0) continue;
      if (p.vx > 0 || p.x >= oldX) p.x = platform.x - p.w;
      else p.x = platform.x + platform.w;
      p.vx = 0;
    }
  }

  function moveVertical(state, dt) {
    var p = state.player;
    var previousY = p.y;
    var previousBottom = p.y + p.h;
    var wasGround = p.onGround;
    p.onGround = false;
    p.vy = clamp(p.vy + T.gravity * dt, -T.jumpSpeed, T.maxFallSpeed);
    if (!state._inputJumpHeld && p.vy < 0) p.vy += T.jumpCutGravity * dt;
    p.vy = clamp(p.vy, -T.jumpSpeed, T.maxFallSpeed);
    var nextY = p.y + p.vy * dt;
    var landing = null;
    if (p.vy >= 0) {
      var all = [];
      var platforms = solidSurfaces(state);
      for (var i = 0; i < platforms.length; i++) all.push(platforms[i]);
      if (state._dropTimer <= 0) for (var j = 0; j < state.echo.length; j++) all.push(echoSurface(state, state.echo[j]));
      for (var k = 0; k < all.length; k++) {
        var surface = all[k];
        if (!horizontalOverlap(p, surface)) continue;
        var landingTolerance = surface.echo ? T.echoLandingTolerance : T.landingTolerance;
        if (previousBottom <= surface.y + landingTolerance && nextY + p.h >= surface.y - T.collisionEpsilon) {
          if (!landing || surface.y < landing.y) landing = surface;
        }
      }
    } else {
      var solids = solidSurfaces(state);
      for (var s = 0; s < solids.length; s++) {
        var ceiling = solids[s];
        if (!horizontalOverlap(p, ceiling)) continue;
        if (previousY >= ceiling.y + ceiling.h - 1 && nextY <= ceiling.y + ceiling.h) {
          p.y = ceiling.y + ceiling.h;
          p.vy = 0;
          return;
        }
      }
    }
    if (landing) {
      p.y = landing.y - p.h;
      p.vy = 0;
      p.onGround = true;
      state._coyote = T.coyoteTime;
      if (!wasGround) emit(state, 'land', p.x, p.y + p.h);
    } else {
      p.y = nextY;
      var support = null;
      var supportList = solidSurfaces(state);
      for (var q = 0; q < supportList.length; q++) {
        var sp = supportList[q];
        if (Math.abs(p.y + p.h - sp.y) <= T.supportTolerance && horizontalOverlap(p, sp)) { support = sp; break; }
      }
      if (!support && state._dropTimer <= 0) {
        for (var r = 0; r < state.echo.length; r++) {
          var ep = state.echo[r];
          if (Math.abs(p.y + p.h - ep.y) <= T.echoSupportTolerance && horizontalOverlap(p, ep)) { support = ep; break; }
        }
      }
      if (support && p.vy >= 0) {
        p.y = support.y - p.h;
        p.vy = 0;
        p.onGround = true;
        state._coyote = T.coyoteTime;
        if (!wasGround) emit(state, 'land', p.x, p.y + p.h);
      }
    }
  }

  function collectSeeds(state) {
    var p = playerRect(state);
    for (var i = 0; i < state.level.seeds.length; i++) {
      if (state.collected[i]) continue;
      var seed = state.level.seeds[i];
      if (p.x < seed.x + T.seedRadius && p.x + p.w > seed.x - T.seedRadius && p.y < seed.y + T.seedRadius && p.y + p.h > seed.y - T.seedRadius) {
        state.collected[i] = true;
        emit(state, 'seed', seed.x, seed.y);
      }
    }
  }

  function checkHazards(state) {
    var p = playerRect(state);
    var hazards = state.level.hazards || [];
    for (var i = 0; i < hazards.length; i++) {
      var rect = hazardRect(hazards[i], state.elapsed);
      var pad = T.hazardPadding;
      if (intersects({ x: p.x + pad, y: p.y + pad, w: p.w - pad * 2, h: p.h - pad * 2 }, rect)) {
        state.status = 'dead';
        state.deathReason = 'hazard';
        emit(state, 'death', p.x, p.y);
        return true;
      }
    }
    return false;
  }

  function checkExit(state) {
    if (!intersects(playerRect(state), state.level.exit)) return;
    var complete = true;
    for (var i = 0; i < state.collected.length; i++) if (!state.collected[i]) complete = false;
    if (complete) {
      state.status = 'complete';
      emit(state, 'complete', state.player.x, state.player.y);
    } else if (state.elapsed - state._lastDenied > T.deniedCooldown) {
      state._lastDenied = state.elapsed;
      emit(state, 'denied', state.player.x, state.player.y);
    }
  }

  function create(index) {
    var levelIndex = clamp(Number(index) || 0, 0, AL.levels.length - 1) | 0;
    var level = copy(AL.levels[levelIndex]);
    var p = {
      x: level.spawn.x, y: level.spawn.y, w: T.playerWidth, h: T.playerHeight,
      vx: 0, vy: 0, onGround: false, facing: 1
    };
    var state = {
      levelIndex: levelIndex,
      level: level,
      player: p,
      elapsed: 0,
      history: [{ x: p.x, y: p.y, t: 0 }],
      echo: [],
      echoRemaining: 0,
      tapeRatio: 0,
      collected: level.seeds.map(function () { return false; }),
      status: 'playing',
      events: [],
      rewinds: 0,
      deathReason: null,
      _inputAxis: 0,
      _inputJumpHeld: false,
      _coyote: 0,
      _jumpBuffer: 0,
      _dropTimer: 0,
      _lastDenied: -Infinity
    };
    return state;
  }

  function step(state, input, dt) {
    state.events.length = 0;
    if (state.status !== 'playing') return state;
    var seconds = clamp(Number(dt) || T.nominalDt, 0, T.maxStepDt);
    var controls = input || {};
    state.elapsed += seconds;
    state._inputAxis = clamp(Number(controls.axis) || 0, -1, 1);
    state._inputJumpHeld = !!controls.jumpHeld;
    state._dropTimer = Math.max(0, state._dropTimer - seconds);
    if (controls.rewind) {
      if (rewind(state)) return state;
    }
    if (controls.jump) state._jumpBuffer = T.jumpBufferTime;
    else state._jumpBuffer = Math.max(0, state._jumpBuffer - seconds);
    if (state._jumpBuffer > 0 && (state.player.onGround || state._coyote > 0)) {
      state.player.vy = -T.jumpSpeed;
      state.player.onGround = false;
      state._coyote = 0;
      state._jumpBuffer = 0;
      emit(state, 'jump', state.player.x, state.player.y + state.player.h);
    }
    if (controls.down && state.player.onGround && isDropSupport(state)) {
      state._dropTimer = 0.17;
      state.player.onGround = false;
      state.player.y += 3;
    }
    moveHorizontal(state, seconds);
    moveVertical(state, seconds);
    state._coyote = Math.max(0, state._coyote - seconds);
    if (state.echoRemaining > 0) {
      state.echoRemaining = Math.max(0, state.echoRemaining - seconds);
      if (state.echoRemaining === 0) state.echo = [];
    }
    collectSeeds(state);
    if (checkHazards(state)) return state;
    if (state.player.y > AL.height + T.voidMargin) {
      state.status = 'dead';
      state.deathReason = 'void';
      emit(state, 'death', state.player.x, state.player.y);
      return state;
    }
    checkExit(state);
    updateHistory(state);
    return state;
  }

  var API = { create: create, step: step, hazardRect: hazardRect };
  root.AfterlightEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
