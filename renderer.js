/* AFTERLIGHT presentation renderer. The world is always drawn in 960×540 space. */
(function (root) {
  'use strict';
  const W = 960, H = 540;
  const TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fract = n => n - Math.floor(n);
  const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const chapterNumber = value => {
    if (Number.isFinite(value)) return Math.abs(Math.floor(value));
    const names = { shore: 0, 'flooded-stacks': 1, stacks: 2, tideworks: 3, cathedral: 4, constellation: 5, observatory: 6 };
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(names, value)) return names[value];
    return typeof value === 'string' ? Math.abs([...value].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 7 : 0;
  };
  const rounded = (ctx, x, y, w, h, r) => {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  class AfterlightRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.time = 0;
      this.lastStamp = '';
      this.particles = [];
      this.shake = 0;
      this.flash = 0;
      this.pixelRatio = 0;
      this.dust = Array.from({ length: 92 }, (_, i) => ({
        x: hash(i * 2.3) * W, y: 42 + hash(i * 4.1) * 410,
        r: .35 + hash(i * 9.7) * 1.2, phase: hash(i * 13.2) * TAU,
        speed: .2 + hash(i * 15.8) * .55
      }));
      this.resize();
    }

    resize() {
      const ratio = Math.min(2, Math.max(1, root.devicePixelRatio || 1));
      if (ratio === this.pixelRatio && this.canvas.width === W * ratio) return;
      this.pixelRatio = ratio;
      this.canvas.width = W * ratio;
      this.canvas.height = H * ratio;
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    reset() {
      this.particles.length = 0;
      this.shake = 0;
      this.flash = 0;
      this.lastStamp = '';
    }

    draw(state, view) {
      view = view || {};
      const dt = clamp(Number(view.dt) || 0, 0, .08);
      this.time = Number.isFinite(view.time) ? view.time : this.time + dt;
      this.resize();
      state = state || {};
      const level = state.level || {};
      const decor = level.decor || {};
      const reduced = !!view.reducedMotion;
      const mode = view.mode || 'playing';
      this.reducedMotion = reduced;
      this.consumeEvents(state.events || [], state, reduced);
      this.shake = reduced ? 0 : Math.max(0, this.shake - dt * 2.7);
      this.flash = reduced ? 0 : Math.max(0, this.flash - dt * 2.1);
      this.updateParticles(dt, reduced);

      const ctx = this.ctx;
      ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      this.background(decor, mode);
      const nudge = mode === 'title' || reduced ? 0 : (this.shake ? (hash(this.time * 91) - .5) * this.shake : 0);
      ctx.save(); ctx.translate(nudge, nudge * .35);
      this.architecture(decor, mode);
      this.water(decor);
      this.pendingTrail(state, reduced);
      this.returnMarker(state, reduced);
      this.worldObjects(state, decor, mode, reduced);
      this.drawParticles();
      ctx.restore();
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(245,174,122,${this.flash * .13})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    consumeEvents(events, state, reduced) {
      if (!events.length) return;
      const stamp = `${state.elapsed || 0}|${events.length}|${events.map(e => e.type).join(',')}`;
      if (stamp === this.lastStamp) return;
      this.lastStamp = stamp;
      for (const event of events) {
        const x = Number.isFinite(event.x) ? event.x : (state.player ? state.player.x : 480);
        const y = Number.isFinite(event.y) ? event.y : (state.player ? state.player.y : 300);
        if (event.type === 'rewind') { this.flash = .95; this.shake = reduced ? 0 : 1.6; this.burst(x, y, '#f5ae7a', 16); }
        else if (event.type === 'seed') this.burst(x, y, '#b6f6d8', 12);
        else if (event.type === 'land') this.burst(x, y, '#b6f6d8', 5, .5);
        else if (event.type === 'jump') this.burst(x, y + 22, '#9bdac2', 4, .65);
        else if (event.type === 'death') { this.flash = .5; this.shake = reduced ? 0 : 2.4; this.burst(x, y, '#c87557', 12); }
        else if (event.type === 'complete') { this.flash = .7; this.burst(x, y, '#f5ae7a', 26); }
      }
    }

    background(decor, mode) {
      const ctx = this.ctx;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mode === 'title' ? '#071a2a' : '#061625');
      g.addColorStop(.54, '#09243a'); g.addColorStop(1, '#04101e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const moon = Number.isFinite(decor.moon) ? clamp(decor.moon, 0, 1) : .5;
      const mx = 665 + moon * 140;
      const my = 70 + (1 - moon) * 72;
      const mr = 36 + moon * 10;
      ctx.fillStyle = `rgba(37,91,101,${.07 + moon * .08})`;
      ctx.fillRect(0, 116, W, 175);
      const glow = ctx.createRadialGradient(mx, my, mr * .5, mx, my, mr * 3.7);
      glow.addColorStop(0, 'rgba(182,246,216,.16)'); glow.addColorStop(1, 'rgba(182,246,216,0)');
      ctx.fillStyle = glow; ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
      ctx.fillStyle = '#c8f8dc'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(60,118,111,.25)'; ctx.beginPath(); ctx.arc(mx + mr * .35, my - mr * .1, mr * .7, 0, TAU); ctx.fill();
      for (let i = 0; i < 46; i++) {
        const x = hash(i * 8.3 + chapterNumber(decor.chapter) * 4) * W;
        const y = 24 + hash(i * 3.7) * 265;
        const a = .2 + hash(i * 5.2) * .55;
        ctx.fillStyle = `rgba(182,246,216,${a})`; ctx.fillRect(x, y, 1 + hash(i) * 1.4, 1 + hash(i + 4) * 1.4);
      }
    }

    architecture(decor, mode) {
      const ctx = this.ctx;
      const chapter = chapterNumber(decor.chapter) % 4;
      ctx.save();
      ctx.globalAlpha = .62;
      ctx.strokeStyle = chapter === 2 ? '#315665' : '#2c5665';
      ctx.lineWidth = 13;
      for (let i = -1; i < 6; i++) {
        const x = i * 205 - 32 + chapter * 18;
        const top = 178 + (i % 2) * 24;
        ctx.save();
        ctx.fillStyle = chapter === 3 ? 'rgba(24,67,75,.48)' : 'rgba(18,57,70,.48)';
        ctx.beginPath(); ctx.moveTo(x, 385); ctx.lineTo(x, top + 62); ctx.quadraticCurveTo(x, top, x + 80, top); ctx.quadraticCurveTo(x + 160, top, x + 160, top + 62); ctx.lineTo(x + 160, 385); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#09243a';
        ctx.beginPath(); ctx.moveTo(x + 16, 385); ctx.lineTo(x + 16, top + 65); ctx.quadraticCurveTo(x + 16, top + 17, x + 80, top + 17); ctx.quadraticCurveTo(x + 144, top + 17, x + 144, top + 65); ctx.lineTo(x + 144, 385); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(x, 385); ctx.lineTo(x, top + 62);
        ctx.quadraticCurveTo(x, top, x + 80, top);
        ctx.quadraticCurveTo(x + 160, top, x + 160, top + 62);
        ctx.lineTo(x + 160, 385); ctx.stroke();
      }
      ctx.globalAlpha = .28; ctx.lineWidth = 3;
      for (let y = 210; y < 365; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + chapter * 3); ctx.stroke(); }
      if (chapter === 1 || chapter === 3) {
        ctx.globalAlpha = .3; ctx.strokeStyle = '#c87557'; ctx.lineWidth = 2;
        for (let x = 50; x < W; x += 162) { ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x + 18, 387); ctx.stroke(); }
      }
      ctx.restore();
      const horizon = ctx.createLinearGradient(0, 350, 0, 445);
      horizon.addColorStop(0, 'rgba(10,57,69,0)'); horizon.addColorStop(1, 'rgba(9,61,69,.56)');
      ctx.fillStyle = horizon; ctx.fillRect(0, 340, W, 110);
    }

    water() {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(111,211,188,.09)'; ctx.fillRect(0, 391, W, 2);
      ctx.strokeStyle = 'rgba(182,246,216,.12)'; ctx.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const y = 410 + i * 8 + Math.sin(this.time * .35 + i) * 1.8;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(140, y - 2, 270, y); ctx.quadraticCurveTo(410, y + 2, 545, y); ctx.quadraticCurveTo(700, y - 2, 960, y + 1); ctx.stroke();
      }
    }

    pendingTrail(state, reduced) {
      const history = state.history || [];
      if (history.length < 2) return;
      const ctx = this.ctx;
      const player = state.player || {};
      const playerWidth = Number.isFinite(player.w) ? player.w : 24;
      const playerHeight = Number.isFinite(player.h) ? player.h : 34;
      ctx.save(); ctx.setLineDash(reduced ? [3, 8] : [2, 9]); ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(245,174,122,.58)'; ctx.shadowColor = '#f5ae7a'; ctx.shadowBlur = reduced ? 0 : 7;
      ctx.beginPath();
      history.forEach((point, i) => { const x = point.x + playerWidth / 2, y = point.y + playerHeight; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
      ctx.fillStyle = 'rgba(245,174,122,.4)';
      for (let i = 0; i < history.length; i += 10) { const p = history[i]; ctx.fillRect(p.x + playerWidth / 2 - 1, p.y + playerHeight - 1, 2, 2); }
    }

    returnMarker(state, reduced) {
      const history = state.history || [], player = state.player || {};
      const tape = Number.isFinite(state.tapeRatio) ? state.tapeRatio : (history.length > 12 ? 1 : 0);
      if (history.length < 2 || tape < .72) return;
      const first = history[0], x = first.x + (Number.isFinite(player.w) ? player.w : 24) / 2, y = first.y + (Number.isFinite(player.h) ? player.h : 34);
      const pulse = reduced ? 0 : Math.sin(this.time * 2.3) * 1.5;
      const ctx = this.ctx;
      ctx.save(); ctx.strokeStyle = 'rgba(245,174,122,.82)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]); ctx.shadowColor = '#f5ae7a'; ctx.shadowBlur = reduced ? 0 : 8;
      ctx.beginPath(); ctx.arc(x, y - 3, 7 + pulse, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,214,170,.76)'; ctx.font = '9px Segoe UI, sans-serif'; ctx.letterSpacing = '1px'; ctx.fillText('RETURN', x + 12, y - 6);
      ctx.restore();
    }

    worldObjects(state, decor, mode, reduced) {
      const ctx = this.ctx, level = state.level || {};
      const platforms = level.platforms || [];
      for (const platform of platforms) this.platform(platform, false);
      this.echoes(this.compactEchoes(state.echo || []));
      for (const hazard of level.hazards || []) {
        let rect = hazard;
        if (root.AfterlightEngine && typeof root.AfterlightEngine.hazardRect === 'function') rect = root.AfterlightEngine.hazardRect(hazard, state.elapsed || 0) || hazard;
        this.hazard(rect);
      }
      const seeds = level.seeds || [];
      seeds.forEach((seed, i) => { if (!(state.collected && state.collected[i])) this.seed(seed, i, reduced); });
      if (level.exit) this.exit(level.exit, (state.collected || []).every(Boolean), reduced);
      if (state.player) this.player(state.player, mode, reduced);
    }

    platform(r, echo) {
      if (!r) return;
      const ctx = this.ctx, x = r.x || 0, y = r.y || 0, w = r.w || 0, h = r.h || 0;
      ctx.save();
      if (echo) {
        ctx.shadowColor = '#f5ae7a'; ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(245,174,122,.88)'; rounded(ctx, x, y, w, Math.max(5, h), 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,227,187,.72)'; ctx.fillRect(x + 4, y + 2, Math.max(0, w - 8), 2);
      } else {
        ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 7;
        const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#9ee5ca'); g.addColorStop(.2, '#4c9b93'); g.addColorStop(1, '#193b4b');
        ctx.fillStyle = g; rounded(ctx, x, y, w, h, 3); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.fillStyle = 'rgba(213,255,230,.65)'; ctx.fillRect(x + 2, y, Math.max(0, w - 4), 2);
      }
      ctx.restore();
    }

    compactEchoes(echoes) {
      const compact = [], seen = new Set();
      for (const echo of echoes) {
        if (!echo) continue;
        const key = `${Math.round((echo.x || 0) / 6)}:${Math.round((echo.y || 0) / 5)}:${Math.round((echo.w || 0) / 4)}`;
        if (seen.has(key)) continue;
        seen.add(key); compact.push(echo);
      }
      return compact;
    }

    echoes(echoes) {
      if (!echoes.length) return;
      const ctx = this.ctx;
      ctx.save(); ctx.shadowColor = '#f5ae7a'; ctx.shadowBlur = 7; ctx.fillStyle = 'rgba(245,174,122,.76)';
      ctx.beginPath();
      for (const r of echoes) ctx.rect(r.x || 0, r.y || 0, r.w || 0, Math.max(5, r.h || 0));
      ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,227,187,.72)'; ctx.beginPath();
      for (const r of echoes) ctx.rect((r.x || 0) + 4, (r.y || 0) + 2, Math.max(0, (r.w || 0) - 8), 2);
      ctx.fill(); ctx.restore();
    }

    hazard(r) {
      if (!r) return;
      const ctx = this.ctx; ctx.save(); ctx.fillStyle = 'rgba(200,117,87,.9)'; ctx.shadowColor = '#c87557'; ctx.shadowBlur = 12;
      rounded(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,207,151,.8)'; ctx.lineWidth = 1;
      for (let x = r.x - r.h; x < r.x + r.w; x += 12) { ctx.beginPath(); ctx.moveTo(x, r.y + r.h); ctx.lineTo(x + r.h, r.y); ctx.stroke(); }
      ctx.restore();
    }

    seed(seed, i, reduced) {
      const ctx = this.ctx, x = seed.x, y = seed.y, pulse = reduced ? 0 : Math.sin(this.time * 3 + i) * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(this.time * .7 + i) * .12);
      ctx.shadowColor = '#b6f6d8'; ctx.shadowBlur = reduced ? 7 : 16 + pulse;
      ctx.fillStyle = '#d6ffe9'; ctx.beginPath(); ctx.moveTo(0, -10 - pulse); ctx.quadraticCurveTo(8, -3, 0, 11); ctx.quadraticCurveTo(-8, -3, 0, -10 - pulse); ctx.fill();
      ctx.fillStyle = 'rgba(245,174,122,.9)'; ctx.fillRect(-1, 8, 2, 7);
      ctx.restore();
    }

    exit(r, ready, reduced) {
      const ctx = this.ctx, x = r.x, y = r.y, w = r.w, h = r.h;
      ctx.save(); ctx.strokeStyle = ready ? '#b6f6d8' : 'rgba(141,167,166,.6)'; ctx.lineWidth = 3; ctx.shadowColor = ready ? '#b6f6d8' : 'transparent'; ctx.shadowBlur = ready && !reduced ? 16 : 0;
      rounded(ctx, x, y, w, h, 14); ctx.stroke();
      ctx.fillStyle = ready ? 'rgba(182,246,216,.11)' : 'rgba(141,167,166,.05)'; rounded(ctx, x + 7, y + 7, w - 14, h - 7, 10); ctx.fill();
      ctx.fillStyle = ready ? '#f5ae7a' : '#6a8581'; ctx.beginPath(); ctx.arc(x + w / 2, y + 21, 3, 0, TAU); ctx.fill(); ctx.restore();
    }

    player(p, mode, reduced) {
      const ctx = this.ctx, x = p.x || 0, y = p.y || 0, w = p.w || 22, h = p.h || 30, facing = p.facing || 1;
      const bob = reduced ? 0 : Math.sin(this.time * 9) * (p.onGround ? 1.1 : .25);
      ctx.save(); ctx.translate(x + w / 2, y + h); ctx.scale(facing, 1); ctx.translate(0, bob);
      ctx.shadowColor = 'rgba(182,246,216,.3)'; ctx.shadowBlur = 13;
      ctx.fillStyle = '#142f40'; rounded(ctx, -8, -24, 16, 22, 4); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#d49a76'; ctx.beginPath(); ctx.arc(0, -29, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a1b2b'; ctx.beginPath(); ctx.arc(0, -32, 8, Math.PI, TAU); ctx.fill(); ctx.fillRect(-8, -33, 16, 3);
      ctx.strokeStyle = '#e58e64'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(5, -22); ctx.lineTo(13, -13); ctx.stroke();
      ctx.strokeStyle = '#f5ae7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -21); ctx.quadraticCurveTo(-12, -18, -16, -25 - Math.sin(this.time * 8) * 2); ctx.stroke();
      ctx.fillStyle = '#f5ae7a'; ctx.shadowColor = '#f5ae7a'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(16, -10, 4.5, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#b6f6d8'; ctx.fillRect(-6, -2, 5, 2); ctx.fillRect(2, -2, 5, 2);
      ctx.restore();
    }

    burst(x, y, color, count, velocity) {
      if (this.reducedMotion) return;
      velocity = velocity || 1;
      for (let i = 0; i < count; i++) {
        const a = hash(this.time * 71 + i * 2.7) * TAU, speed = (12 + hash(i * 4.1) * 35) * velocity;
        this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 8, life: .5 + hash(i * 3.3) * .55, max: .95, size: 1 + hash(i * 7.2) * 2, color });
      }
    }
    updateParticles(dt, reduced) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 24 * dt;
        if (reduced) { p.x -= p.vx * dt; p.y -= p.vy * dt; }
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
    }
    drawParticles() {
      const ctx = this.ctx;
      for (const p of this.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
      ctx.globalAlpha = 1;
      for (const d of this.dust) { const y = d.y + Math.sin(this.time * d.speed + d.phase) * 3; ctx.globalAlpha = .12 + .1 * Math.sin(this.time * .4 + d.phase); ctx.fillStyle = '#b6f6d8'; ctx.beginPath(); ctx.arc(d.x, y, d.r, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }

  root.AfterlightRenderer = AfterlightRenderer;
  if (typeof module !== 'undefined' && module.exports) module.exports = AfterlightRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
