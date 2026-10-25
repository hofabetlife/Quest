export type MusicThemeId = 'interstellar' | 'synthwave' | 'orbital' | 'tactical' | 'cyberpunk';

export interface MusicThemeInfo {
  id: MusicThemeId;
  name: string;
  shortName: string;
}

export const MUSIC_THEMES: MusicThemeInfo[] = [
  { id: 'interstellar', name: '1. Тишина Космоса (Тёплый Эмбиент)', shortName: '1: Эмбиент' },
  { id: 'synthwave', name: '2. Звёздный Рояль (Пианино и Виолончель)', shortName: '2: Рояль' },
  { id: 'orbital', name: '3. Лунный Родес (Космический Лаунж)', shortName: '3: Родес' },
  { id: 'tactical', name: '4. Хор Туманности (Орган и Струнные)', shortName: '4: Хорал' },
  { id: 'cyberpunk', name: '5. Дрейф в Невесомости (Арфа и Крио-Сон)', shortName: '5: Невесомость' },
];

// Procedural Web Audio API sound effects & 5 slow, contemplative, atmospheric space music themes
class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private themeSessionGain: GainNode | null = null;
  private soundEnabled: boolean = true;
  private musicEnabled: boolean = true;
  private musicInterval: number | null = null;
  private stepIndex: number = 0;
  private currentTheme: MusicThemeId = 'interstellar';

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(1.8, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // Dedicated Music Bus with lush Stereo Spatial Delay / Warm Reverb-like Diffusion
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.setValueAtTime(0.95, this.ctx.currentTime);
        this.musicBus.connect(this.masterGain);

        try {
          const delayL = this.ctx.createDelay(2.0);
          const delayR = this.ctx.createDelay(2.0);
          delayL.delayTime.setValueAtTime(0.64, this.ctx.currentTime);
          delayR.delayTime.setValueAtTime(0.96, this.ctx.currentTime);

          const filterL = this.ctx.createBiquadFilter();
          const filterR = this.ctx.createBiquadFilter();
          filterL.type = 'lowpass';
          filterR.type = 'lowpass';
          filterL.frequency.setValueAtTime(920, this.ctx.currentTime);
          filterR.frequency.setValueAtTime(740, this.ctx.currentTime);

          const fbL = this.ctx.createGain();
          const fbR = this.ctx.createGain();
          fbL.gain.setValueAtTime(0.38, this.ctx.currentTime);
          fbR.gain.setValueAtTime(0.36, this.ctx.currentTime);

          const wetGain = this.ctx.createGain();
          wetGain.gain.setValueAtTime(0.46, this.ctx.currentTime);

          this.musicBus.connect(delayL);
          this.musicBus.connect(delayR);

          delayL.connect(filterL);
          filterL.connect(fbL);
          fbL.connect(delayR);

          delayR.connect(filterR);
          filterR.connect(fbR);
          fbR.connect(delayL);

          if (typeof this.ctx.createStereoPanner === 'function') {
            const panL = this.ctx.createStereoPanner();
            const panR = this.ctx.createStereoPanner();
            panL.pan.setValueAtTime(-0.5, this.ctx.currentTime);
            panR.pan.setValueAtTime(0.5, this.ctx.currentTime);
            filterL.connect(panL);
            filterR.connect(panR);
            panL.connect(wetGain);
            panR.connect(wetGain);
          } else {
            filterL.connect(wetGain);
            filterR.connect(wetGain);
          }

          wetGain.connect(this.masterGain);
        } catch {}
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private getDest(): AudioNode | null {
    if (!this.ctx) return null;
    return this.masterGain ?? this.ctx.destination;
  }

  private getMusicDest(): AudioNode | null {
    if (!this.ctx) return null;
    return this.themeSessionGain ?? this.musicBus ?? this.masterGain ?? this.ctx.destination;
  }

  public ensureStarted() {
    this.init();
    if (this.musicEnabled && this.musicInterval === null) {
      this.startSoundtrack();
    }
  }

  public setSoundEnabled(val: boolean) {
    this.soundEnabled = val;
    this.musicEnabled = val;
    if (!val) {
      this.stopSoundtrack();
    } else {
      this.startSoundtrack();
    }
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public getMusicTheme(): MusicThemeId {
    return this.currentTheme;
  }

  public setMusicTheme(theme: MusicThemeId) {
    this.currentTheme = theme;
    this.stepIndex = 0;
    this.init();
    if (this.musicInterval !== null) {
      this.stopSoundtrack();
    }
    if (this.musicEnabled && this.soundEnabled) {
      this.startSoundtrack();
    }
  }

  public nextMusicTheme(): MusicThemeId {
    const idx = MUSIC_THEMES.findIndex((t) => t.id === this.currentTheme);
    const next = MUSIC_THEMES[(idx + 1) % MUSIC_THEMES.length].id;
    this.setMusicTheme(next);
    return next;
  }

  public prevMusicTheme(): MusicThemeId {
    const idx = MUSIC_THEMES.findIndex((t) => t.id === this.currentTheme);
    const prev = MUSIC_THEMES[(idx - 1 + MUSIC_THEMES.length) % MUSIC_THEMES.length].id;
    this.setMusicTheme(prev);
    return prev;
  }

  /**
   * Plays a slow, breathing, warm ambient pad or string voice with a long smooth attack & release
   * so there is zero harshness or abrupt clicking.
   */
  private playSlowPadVoice(
    freq: number,
    duration: number,
    peakGain: number,
    attackSec: number = 1.6,
    cutoffHz: number = 520,
    detuneCents: number = 0,
    wave: OscillatorType = 'triangle'
  ) {
    if (!this.ctx) return;
    const dest = this.getMusicDest();
    if (!dest) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = wave;
    osc2.frequency.setValueAtTime(freq, now);
    osc2.detune.setValueAtTime(detuneCents, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz * 0.65, now);
    filter.frequency.linearRampToValueAtTime(cutoffHz, now + attackSec);
    filter.frequency.exponentialRampToValueAtTime(Math.max(90, cutoffHz * 0.45), now + duration);

    gain.gain.setValueAtTime(0.0002, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + attackSec);
    gain.gain.setValueAtTime(peakGain * 0.92, now + Math.max(attackSec + 0.1, duration * 0.55));
    gain.gain.exponentialRampToValueAtTime(0.0002, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.05);
    osc2.stop(now + duration + 0.05);
  }

  /**
   * Plays a soft, warm Felt Piano / Rhodes / Harp note with gentle hammer warmth and long natural decay.
   */
  private playSoftAcousticNote(
    freq: number,
    duration: number,
    peakGain: number,
    timbre: 'felt-piano' | 'rhodes' | 'harp' | 'celesta'
  ) {
    if (!this.ctx) return;
    const dest = this.getMusicDest();
    if (!dest) return;
    const now = this.ctx.currentTime;

    const bodyOsc = this.ctx.createOscillator();
    const overtoneOsc = this.ctx.createOscillator();
    const overtoneGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    bodyOsc.type = timbre === 'harp' ? 'triangle' : 'sine';
    bodyOsc.frequency.setValueAtTime(freq, now);

    if (timbre === 'felt-piano') {
      overtoneOsc.type = 'triangle';
      overtoneOsc.frequency.setValueAtTime(freq * 2, now);
      overtoneOsc.detune.setValueAtTime(2.5, now);
      overtoneGain.gain.setValueAtTime(0.18, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.45);
      filter.frequency.setValueAtTime(780, now);
      filter.frequency.exponentialRampToValueAtTime(220, now + duration);
    } else if (timbre === 'rhodes') {
      overtoneOsc.type = 'sine';
      overtoneOsc.frequency.setValueAtTime(freq * 3, now);
      overtoneGain.gain.setValueAtTime(0.12, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.004, now + 0.45);
      filter.frequency.setValueAtTime(980, now);
      filter.frequency.exponentialRampToValueAtTime(340, now + duration);
    } else if (timbre === 'harp') {
      overtoneOsc.type = 'sine';
      overtoneOsc.frequency.setValueAtTime(freq * 2, now);
      overtoneGain.gain.setValueAtTime(0.22, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.008, now + duration * 0.6);
      filter.frequency.setValueAtTime(1150, now);
      filter.frequency.exponentialRampToValueAtTime(310, now + duration);
    } else {
      // 'celesta' — pure crystalline bell droplet
      overtoneOsc.type = 'sine';
      overtoneOsc.frequency.setValueAtTime(freq * 2.0, now);
      overtoneGain.gain.setValueAtTime(0.15, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.005, now + duration * 0.5);
      filter.frequency.setValueAtTime(1450, now);
      filter.frequency.exponentialRampToValueAtTime(480, now + duration);
    }

    filter.type = 'lowpass';

    const attack = timbre === 'felt-piano' ? 0.045 : timbre === 'rhodes' ? 0.035 : 0.028;
    gain.gain.setValueAtTime(0.0003, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + attack);
    gain.gain.exponentialRampToValueAtTime(peakGain * 0.28, now + duration * 0.38);
    gain.gain.exponentialRampToValueAtTime(0.0002, now + duration);

    bodyOsc.connect(filter);
    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    bodyOsc.start(now);
    overtoneOsc.start(now);
    bodyOsc.stop(now + duration + 0.05);
    overtoneOsc.stop(now + duration + 0.05);
  }

  private playBeatStep() {
    if (!this.musicEnabled || !this.soundEnabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    const step = this.stepIndex++;
    const barIdx = Math.floor(step / 8) % 4;
    const stepInBar = step % 8;

    if (this.currentTheme === 'interstellar') {
      // =====================================================================
      // 1. ТИШИНА КОСМОСА (Deep Space Warm Ambient — Brian Eno / Solaris / Stellaris)
      //    Slow, weightless 6.5-second pad swells (Fmaj9 -> Cmaj9 -> Dm11 -> Bbmaj7#11)
      //    with sparse, delicate celesta droplets floating in deep reverb.
      // =====================================================================
      const padChords = [
        [87.31, 174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj9
        [65.41, 130.81, 196.0, 246.94, 293.66, 392.0], // Cmaj9
        [73.42, 146.83, 220.0, 261.63, 329.63, 392.0], // Dm11
        [58.27, 116.54, 174.61, 220.0, 261.63, 329.63], // Bbmaj9
      ];
      const sparseDroplets = [
        [523.25, 0, 0, 659.25, 0, 587.33, 0, 0],
        [493.88, 0, 0, 587.33, 0, 0, 392.0, 0],
        [440.0, 0, 523.25, 0, 0, 659.25, 0, 0],
        [587.33, 0, 0, 523.25, 0, 0, 440.0, 0],
      ];

      if (stepInBar === 0) {
        const chord = padChords[barIdx];
        // Deep warm sub root
        this.playSlowPadVoice(chord[0], 7.8, 0.085, 2.2, 240, 0, 'sine');
        // Lush warm detuned pad voices
        for (let i = 1; i < chord.length; i++) {
          this.playSlowPadVoice(
            chord[i],
            7.6,
            0.036,
            2.4,
            460,
            i % 2 === 0 ? 5 : -5,
            'triangle'
          );
        }
      }

      const dropFreq = sparseDroplets[barIdx][stepInBar];
      if (dropFreq > 0) {
        this.playSoftAcousticNote(dropFreq, 3.2, 0.048, 'celesta');
      }
    } else if (this.currentTheme === 'synthwave') {
      // =====================================================================
      // 2. ЗВЁЗДНЫЙ РОЯЛЬ (Contemplative Felt Piano & Warm Cello — Nils Frahm / Interstellar Piano)
      //    Slow, intimate soft felt piano broken chords over a warm bowed cello sustain.
      // =====================================================================
      const celloRoots = [110.0, 87.31, 130.81, 98.0]; // A2 -> F2 -> C3 -> G2
      const celloFifths = [164.81, 130.81, 196.0, 146.83];
      const pianoBars = [
        // Bar 1 (Am9): A3 - E4 - B4 - C5 - E4 - B4 - A4 - E4
        [220.0, 329.63, 493.88, 523.25, 329.63, 493.88, 440.0, 329.63],
        // Bar 2 (Fmaj9): F3 - C4 - G4 - A4 - C4 - G4 - E4 - C4
        [174.61, 261.63, 392.0, 440.0, 261.63, 392.0, 329.63, 261.63],
        // Bar 3 (Cmaj7): C4 - G4 - B4 - E5 - G4 - B4 - D5 - G4
        [261.63, 392.0, 493.88, 659.25, 392.0, 493.88, 587.33, 392.0],
        // Bar 4 (Em7 -> G6): E3 - B3 - G4 - A4 - B3 - G4 - D4 - B3
        [164.81, 246.94, 392.0, 440.0, 246.94, 392.0, 293.66, 246.94],
      ];

      // Warm bowed cello + viola sustain at the start of each bar
      if (stepInBar === 0) {
        this.playSlowPadVoice(celloRoots[barIdx], 6.8, 0.075, 1.8, 340, 4, 'sawtooth');
        this.playSlowPadVoice(celloRoots[barIdx] * 0.5, 6.8, 0.07, 1.8, 190, 0, 'sine');
        this.playSlowPadVoice(celloFifths[barIdx], 6.6, 0.038, 2.1, 420, -4, 'triangle');
      }

      // Unhurried, expressive felt piano notes
      const pFreq = pianoBars[barIdx][stepInBar];
      const velocity = stepInBar === 0 ? 0.088 : stepInBar === 3 ? 0.072 : 0.052;
      this.playSoftAcousticNote(pFreq, 2.9, velocity, 'felt-piano');
    } else if (this.currentTheme === 'orbital') {
      // =====================================================================
      // 3. ЛУННЫЙ РОДЕС (Space Lounge Vintage Rhodes & Smooth Analog Pad)
      //    Warm, unhurried Fender Rhodes electric piano ninth chords (Cm11 -> Abmaj9 -> Fm9 -> G7sus4)
      //    with gentle bell-tine warmth and slow cosmic breath.
      // =====================================================================
      const rhodesChords = [
        [130.81, 196.0, 233.08, 293.66, 349.23], // Cm11
        [103.83, 155.56, 196.0, 233.08, 311.13], // Abmaj9
        [87.31, 174.61, 207.65, 261.63, 311.13], // Fm9
        [98.0, 174.61, 196.0, 261.63, 293.66], // G7sus4
      ];
      const slowSoloNotes = [
        [0, 0, 587.33, 0, 523.25, 0, 392.0, 0],
        [0, 0, 523.25, 0, 466.16, 0, 392.0, 0],
        [0, 0, 466.16, 0, 392.0, 0, 349.23, 0],
        [0, 0, 392.0, 0, 349.23, 0, 293.66, 0],
      ];

      // Gently rolled Rhodes chord on beat 0 (with a soft re-voicing on beat 4)
      if (stepInBar === 0) {
        const chord = rhodesChords[barIdx];
        this.playSlowPadVoice(chord[0], 7.2, 0.07, 1.5, 280, 0, 'sine');
        chord.forEach((f, idx) => {
          window.setTimeout(() => {
            this.playSoftAcousticNote(f, 4.2, 0.052, 'rhodes');
          }, idx * 75);
        });
      } else if (stepInBar === 4) {
        const chord = rhodesChords[barIdx];
        this.playSoftAcousticNote(chord[2], 3.4, 0.038, 'rhodes');
        this.playSoftAcousticNote(chord[4], 3.4, 0.042, 'rhodes');
      }

      // Slow, singing high Rhodes/flute melody note on beats 2, 4, 6
      const soloFreq = slowSoloNotes[barIdx][stepInBar];
      if (soloFreq > 0) {
        this.playSlowPadVoice(soloFreq, 2.4, 0.042, 0.45, 760, 3, 'sine');
      }
    } else if (this.currentTheme === 'tactical') {
      // =====================================================================
      // 4. ХОР ТУМАННОСТИ (Cathedral Space Organ & Ethereal String Choir — Homeworld / Adagio)
      //    Solemn, majestic, slow-breathing harmonic swells with zero percussion or staccato notes.
      // =====================================================================
      const choralChords = [
        [73.42, 146.83, 220.0, 293.66, 349.23, 440.0], // Dm
        [58.27, 116.54, 174.61, 261.63, 293.66, 440.0], // Bbadd9
        [87.31, 130.81, 174.61, 261.63, 329.63, 440.0], // Fmaj7
        [65.41, 130.81, 196.0, 246.94, 329.63, 392.0], // Cmaj7
      ];

      if (stepInBar === 0) {
        const chord = choralChords[barIdx];
        // Deep cathedral pedal pipe (32-foot sine sub)
        this.playSlowPadVoice(chord[0], 8.2, 0.095, 2.5, 210, 0, 'sine');
        // Warm choral & organ drawbar voices swelling over 2.6 seconds
        for (let i = 1; i < chord.length; i++) {
          this.playSlowPadVoice(
            chord[i],
            8.0,
            0.038,
            2.6,
            520,
            i % 2 === 0 ? 6 : -6,
            i % 2 === 0 ? 'triangle' : 'sawtooth'
          );
        }
      } else if (stepInBar === 4) {
        // Gentle upper harmonic shimmer halfway through the bar
        const topNote = choralChords[barIdx][5];
        this.playSlowPadVoice(topNote * 1.5, 4.5, 0.024, 1.6, 680, 4, 'sine');
      }
    } else {
      // =====================================================================
      // 5. ДРЕЙФ В НЕВЕСОМОСТИ (Zero-G Harp Plucks & Cryo-Sleep Drone — Outer Wilds / Subnautica Calm)
      //    Unhurried, soothing acoustic-harp plucks drifting over a warm, slow-breathing ocean-space drone.
      // =====================================================================
      const droneRoots = [69.3, 58.27, 92.5, 103.83]; // Db2 -> Bb1 -> Gb2 -> Ab2
      const harpPatterns = [
        // Dbmaj9: Db4 - F4 - Ab4 - C5 - Eb5 - C5 - Ab4 - F4
        [277.18, 349.23, 415.3, 523.25, 622.25, 523.25, 415.3, 349.23],
        // Bbm11: Bb3 - F4 - Ab4 - C5 - Db5 - C5 - Ab4 - F4
        [233.08, 349.23, 415.3, 523.25, 554.37, 523.25, 415.3, 349.23],
        // Gbmaj9: Gb3 - Db4 - F4 - Ab4 - Bb4 - Ab4 - F4 - Db4
        [185.0, 277.18, 349.23, 415.3, 466.16, 415.3, 349.23, 277.18],
        // Ab6sus4: Ab3 - Eb4 - F4 - Bb4 - C5 - Bb4 - F4 - Eb4
        [207.65, 311.13, 349.23, 466.16, 523.25, 466.16, 349.23, 311.13],
      ];

      if (stepInBar === 0) {
        const root = droneRoots[barIdx];
        this.playSlowPadVoice(root, 7.2, 0.085, 2.0, 240, 0, 'sine');
        this.playSlowPadVoice(root * 2, 7.2, 0.042, 2.2, 380, 5, 'triangle');
        this.playSlowPadVoice(root * 3, 7.0, 0.028, 2.4, 440, -5, 'sine');
      }

      // Unhurried, warm harp pluck on each slow beat
      const hFreq = harpPatterns[barIdx][stepInBar];
      const hGain = stepInBar === 0 || stepInBar === 4 ? 0.068 : 0.048;
      this.playSoftAcousticNote(hFreq, 2.6, hGain, 'harp');
    }
  }

  public startSoundtrack() {
    if (!this.musicEnabled || typeof window === 'undefined') return;
    if (this.musicInterval !== null) return;
    this.init();

    if (this.ctx && this.musicBus) {
      this.themeSessionGain = this.ctx.createGain();
      this.themeSessionGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.themeSessionGain.connect(this.musicBus);
    }

    // Slow, measured, unhurried beat intervals (780ms to 960ms per step — zero frantic rhythms!)
    const stepMs =
      this.currentTheme === 'interstellar'
        ? 920
        : this.currentTheme === 'tactical'
        ? 960
        : this.currentTheme === 'orbital'
        ? 860
        : this.currentTheme === 'synthwave'
        ? 780
        : 820; // 'cyberpunk' (Zero-G Harp)

    // Play the very first step immediately so the warm pad/chord starts right away
    try {
      this.playBeatStep();
    } catch {}

    this.musicInterval = window.setInterval(() => {
      try {
        this.playBeatStep();
      } catch {}
    }, stepMs);
  }

  public stopSoundtrack() {
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.ctx && this.themeSessionGain) {
      const oldSession = this.themeSessionGain;
      this.themeSessionGain = null;
      try {
        const now = this.ctx.currentTime;
        oldSession.gain.setValueAtTime(oldSession.gain.value, now);
        oldSession.gain.linearRampToValueAtTime(0.0001, now + 0.18);
        window.setTimeout(() => {
          try {
            oldSession.disconnect();
          } catch {}
        }, 220);
      } catch {}
    }
  }

  public playFootstep() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(115 + Math.random() * 25, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.065);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch {}
  }

  // Alias used by ShipCanvas movement loop
  public playStep() {
    this.playFootstep();
  }

  public playTerminalClick() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1250, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch {}
  }

  public playTaskOpen() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {}
  }

  public playTaskSuccess() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;

    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.24, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.42);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.43);
      });
    } catch {}
  }

  // Alias used by task modals
  public playSuccess() {
    this.playTaskSuccess();
  }

  public playWarn() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.setValueAtTime(180, now + 0.09);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.29);
    } catch {}
  }

  public playHardTaunt() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(175, now);
      osc.frequency.exponentialRampToValueAtTime(68, now + 0.18);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.19);
    } catch {}
  }

  public playAirlockEscape() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;

    try {
      const now = this.ctx.currentTime;
      const freqs = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.1);
        gain.gain.setValueAtTime(0.24, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.85);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.86);
      });
    } catch {}
  }

  public playClick() {
    this.playTerminalClick();
  }

  public playBlackHoleIntro() {
    if (!this.soundEnabled || !this.ctx || this.ctx.state === 'suspended') return;
    const dest = this.getDest();
    if (!dest) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(78, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 2.2);
      gain.gain.setValueAtTime(0.002, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 2.35);
    } catch {}
  }

  public playWarpJump() {
    if (!this.soundEnabled || !this.ctx || this.ctx.state === 'suspended') return;
    const dest = this.getDest();
    if (!dest) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.55);
      osc.frequency.exponentialRampToValueAtTime(52, now + 1.2);
      gain.gain.setValueAtTime(0.002, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 1.3);
    } catch {}
  }

  public playAsteroidImpact() {
    if (!this.soundEnabled || !this.ctx || this.ctx.state === 'suspended') return;
    const dest = this.getDest();
    if (!dest) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(155, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.8);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.9);
    } catch {}
  }

  public playWireSnap() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(1180, now + 0.06);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch {}
  }

  public playDoorOpen() {
    if (!this.soundEnabled) return;
    this.ensureStarted();
    const dest = this.getDest();
    if (!this.ctx || !dest) return;
    try {
      const now = this.ctx.currentTime;
      // Pneumatic hydraulic lift hiss + upward mechanical servo tone
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.linearRampToValueAtTime(220, now + 0.55);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.65);

      // Confirmation chime
      const chime = this.ctx.createOscillator();
      const cGain = this.ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(659.25, now + 0.08);
      chime.frequency.setValueAtTime(880, now + 0.22);
      cGain.gain.setValueAtTime(0.18, now + 0.08);
      cGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      chime.connect(cGain);
      cGain.connect(dest);
      chime.start(now + 0.08);
      chime.stop(now + 0.58);
    } catch {}
  }
}

export const sound = new AudioManager();

