// All sound is synthesised with WebAudio: no audio files, no network. One shared
// noise buffer, short envelopes, and a tiny helper per effect. The context is created
// on the first user gesture (the play click), so browsers never block it. Spells
// sound like spells: a spark crackles high, an ember lance rumbles low, frost
// shimmers, void booms.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
    const length = Math.floor(context.sampleRate * 1);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function noise(duration, filterType, frequency, gainValue, when = 0) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t, Math.random() * 0.5);
    source.stop(t + duration + 0.05);
  }

  function tone(frequency, duration, type, gainValue, slideTo = 0, when = 0) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime + when;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, t);
    if (slideTo > 0) oscillator.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.05);
  }

  // Distance-attenuated cast: the caller passes 0..1 (1 = own spellbook).
  function shot(kind, loudness = 1) {
    if (kind === 'ember') {
      noise(0.14, 'lowpass', 1800, 0.9 * loudness);
      tone(160, 0.1, 'sawtooth', 0.22 * loudness, 55);
    } else if (kind === 'frost') {
      tone(2400, 0.07, 'sine', 0.16 * loudness, 3200);
      tone(1800, 0.09, 'sine', 0.12 * loudness, 2600);
    } else if (kind === 'void') {
      noise(0.22, 'lowpass', 1200, 1.0 * loudness);
      tone(95, 0.18, 'sine', 0.35 * loudness, 38);
    } else if (kind === 'bolt') {
      noise(0.09, 'bandpass', 2800, 0.6 * loudness);
      tone(720, 0.07, 'square', 0.14 * loudness, 240);
    } else {
      // spark: a bright crackle.
      noise(0.08, 'highpass', 3200, 0.6 * loudness);
      tone(1400, 0.06, 'square', 0.16 * loudness, 2600);
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    shot,
    dryFire() {
      tone(1400, 0.03, 'square', 0.12);
    },
    recharge() {
      tone(900, 0.04, 'square', 0.1);
      tone(620, 0.04, 'square', 0.1, 0, 0.16);
      tone(1100, 0.05, 'square', 0.14, 0, 0.55);
    },
    hit() {
      tone(2100, 0.05, 'sine', 0.22);
    },
    kill() {
      tone(1560, 0.07, 'sine', 0.22);
      tone(2340, 0.1, 'sine', 0.2, 0, 0.07);
    },
    hurt() {
      noise(0.12, 'lowpass', 500, 0.5);
      tone(110, 0.14, 'sawtooth', 0.2, 70);
    },
    step() {
      noise(0.05, 'lowpass', 420, 0.12);
    },
    captureBeep(final = false) {
      tone(final ? 1750 : 1250, final ? 0.16 : 0.07, 'sine', 0.22);
    },
    capture() {
      tone(523, 0.12, 'sine', 0.22);
      tone(784, 0.12, 'sine', 0.22, 0, 0.1);
      tone(1046, 0.2, 'sine', 0.24, 0, 0.2);
    },
    castWindUp(duration) {
      tone(300, duration, 'sine', 0.16, 1200);
    },
    explosion() {
      noise(1.1, 'lowpass', 900, 1.0);
      tone(70, 0.9, 'sine', 0.7, 32);
      noise(0.4, 'highpass', 3000, 0.4, 0.05);
    },
    buy() {
      tone(880, 0.06, 'sine', 0.2);
      tone(1320, 0.08, 'sine', 0.18, 0, 0.06);
    },
    denied() {
      tone(220, 0.12, 'square', 0.16, 160);
    },
    roundWin() {
      tone(523, 0.14, 'sine', 0.22);
      tone(659, 0.14, 'sine', 0.22, 0, 0.13);
      tone(784, 0.24, 'sine', 0.24, 0, 0.26);
    },
    roundLoss() {
      tone(392, 0.16, 'sine', 0.2);
      tone(330, 0.16, 'sine', 0.2, 0, 0.15);
      tone(262, 0.3, 'sine', 0.22, 0, 0.3);
    },
    tick() {
      tone(1050, 0.04, 'sine', 0.14);
    },
  };
}
