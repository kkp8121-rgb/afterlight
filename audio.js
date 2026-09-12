/* Small Web Audio score. Every method is deliberately safe before a user gesture. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'afterlight-muted';
  const notes = { C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25 };
  const readMute = () => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; } };
  const saveMute = value => { try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch (_) {} };

  class AfterlightAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.ambience = null;
      this.muted = readMute();
      this.started = false;
      this.lastPulse = -1;
    }

    unlock() {
      if (typeof root.AudioContext === 'undefined' && typeof root.webkitAudioContext === 'undefined') return false;
      if (!this.context) {
        const AudioCtor = root.AudioContext || root.webkitAudioContext;
        try {
          this.context = new AudioCtor();
          this.master = this.context.createGain();
          this.master.gain.value = this.muted ? 0 : .22;
          this.master.connect(this.context.destination);
          this.startAmbience();
        } catch (_) { this.context = null; this.master = null; return false; }
      }
      if (this.context.state === 'suspended') { const resume = this.context.resume(); if (resume && resume.catch) resume.catch(() => {}); }
      return true;
    }

    setMuted(value) {
      this.muted = !!value; saveMute(this.muted);
      if (this.master && this.context) {
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.muted ? 0 : .22, now, .035);
      }
    }

    startAmbience() {
      if (!this.context || !this.master || this.started) return;
      this.started = true;
      const ctx = this.context;
      const bus = ctx.createGain(); bus.gain.value = .34; bus.connect(this.master);
      const low = ctx.createOscillator(), high = ctx.createOscillator();
      low.type = 'sine'; high.type = 'triangle'; low.frequency.value = notes.C3; high.frequency.value = notes.G4;
      const lowGain = ctx.createGain(), highGain = ctx.createGain(); lowGain.gain.value = .12; highGain.gain.value = .018;
      low.connect(lowGain).connect(bus); high.connect(highGain).connect(bus);
      low.start(); high.start();
      this.ambience = { bus, low, high, lowGain, highGain };
    }

    tone(frequency, duration, type, volume, when) {
      if (!this.context || !this.master || this.muted) return;
      const ctx = this.context, start = when || ctx.currentTime, end = start + duration;
      try {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.type = type || 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(Math.max(.0001, volume || .08), start + .012); gain.gain.exponentialRampToValueAtTime(.0001, end);
        oscillator.connect(gain).connect(this.master); oscillator.start(start); oscillator.stop(end + .03);
      } catch (_) {}
    }

    chord(frequencies, duration, volume) {
      if (!this.context || this.muted) return;
      const when = this.context.currentTime;
      frequencies.forEach((frequency, index) => this.tone(frequency, duration, index === 0 ? 'sine' : 'triangle', (volume || .06) / (1 + index * .35), when + index * .018));
    }

    event(type) {
      if (!this.context || this.muted) return;
      if (type === 'jump') this.tone(notes.G4, .16, 'triangle', .055);
      else if (type === 'land') this.tone(notes.C3, .12, 'sine', .045);
      else if (type === 'seed') this.chord([notes.E4, notes.A4, notes.C5], .45, .075);
      else if (type === 'rewind') this.chord([notes.C4, notes.G4, notes.C5], .72, .085);
      else if (type === 'death') this.chord([notes.E3, notes.D3], .42, .045);
      else if (type === 'complete') this.chord([notes.G4, notes.C5, notes.E4], 1.15, .085);
      else if (type === 'denied') this.tone(notes.D3, .1, 'square', .028);
    }

    update(state, dt) {
      if (!this.context || this.muted || !this.ambience || !state) return;
      const elapsed = Number(state.elapsed) || 0;
      const pulse = Math.floor(elapsed / 8);
      if (pulse !== this.lastPulse) {
        this.lastPulse = pulse;
        const rootNote = pulse % 3 === 0 ? notes.C3 : pulse % 3 === 1 ? notes.A3 : notes.D3;
        this.ambience.low.frequency.setTargetAtTime(rootNote, this.context.currentTime, .45);
        this.tone(rootNote * 2, 1.8, 'sine', .012);
      }
      if (dt > 0) {
        const shimmer = .014 + Math.sin(elapsed * .21) * .005;
        this.ambience.highGain.gain.setTargetAtTime(shimmer, this.context.currentTime, .8);
      }
    }
  }

  root.AfterlightAudio = AfterlightAudio;
  if (typeof module !== 'undefined' && module.exports) module.exports = AfterlightAudio;
})(typeof window !== 'undefined' ? window : globalThis);
