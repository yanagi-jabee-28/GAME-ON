/*
 * soundManager.js
 * シンプルなサウンド管理ユーティリティ
 * 使い方:
 *   const sm = new SoundManager();
 *   sm.load('click', 'assets/sounds/click.mp3');
 *   sm.play('click');
 */

class SoundManager {
	constructor() {
		this.sounds = {}; // key -> HTMLAudioElement (if loaded)
		this.synthetic = {}; // key -> function to play via WebAudio
		this.variations = {}; // key -> array of functions or srcs for variety
		this.volume = 1.0;
		this.muted = false;

		// WebAudio context for synth fallback
		try {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			this.ctx = new AudioCtx();
		} catch (e) {
			this.ctx = null;
		}

		// prepare simple synthesized sounds
		if (this.ctx) {
			this._prepareSynthetic();
		}
	}

	/**
	 * Load an audio file; fall back to synthetic if not available when playing
	 */

	/**
	 * Load an audio resource. Accepts either a single src string or an array of
	 * candidate sources (prefer earlier entries). This allows providing both
	 * .ogg and .mp3 to improve browser compatibility.
	 */
	load(key, src) {
		try {
			if (Array.isArray(src)) {
				// try to create an Audio element with multiple sources using <audio>
				const audio = document.createElement('audio');
				audio.preload = 'auto';
				src.forEach(s => {
					const source = document.createElement('source');
					source.src = s;
					audio.appendChild(source);
				});
				audio.volume = this.volume;
				audio.addEventListener('error', () => {
					console.warn('Sound file(s) failed to load, will use synthetic if available:', src);
					delete this.sounds[key];
				});
				this.sounds[key] = audio;
			} else {
				const audio = new Audio(src);
				audio.preload = 'auto';
				audio.volume = this.volume;
				audio.addEventListener('error', () => {
					console.warn('Sound file failed to load, will use synthetic if available:', src);
					delete this.sounds[key];
				});
				this.sounds[key] = audio;
			}
		} catch (e) {
			console.error('Failed to load sound', key, src, e);
		}
	}

	play(key) {
		if (this.muted) return;

		// Prefer loaded audio element
		const audio = this.sounds[key];
		if (audio) {
			try {
				// Use clone to allow overlapping playback; ensure volume reflects manager volume
				const clone = audio.cloneNode(true);
				try { clone.volume = this.volume; } catch (e) { }
				clone.play().catch(() => { });
				return;
			} catch (e) {
				// fallback to synthetic
			}
		}

		// If variations are registered, pick one (allows varying click sounds)
		const vars = this.variations[key];
		if (vars && vars.length > 0) {
			const choice = vars[Math.floor(Math.random() * vars.length)];
			if (typeof choice === 'function') {
				try { choice(); return; } catch (e) { console.error(e); }
			} else if (typeof choice === 'string') {
				// treat as src string
				try { const a = new Audio(choice); a.volume = this.volume; a.play().catch(() => { }); return; } catch (e) { }
			}
		}

		// fallback: synthetic sound
		const synth = this.synthetic[key];
		if (synth && this.ctx) {
			try { synth(); } catch (e) { console.error(e); }
		}
	}

	/**
	 * Register variation entries for a key. Each entry can be a function (to play via WebAudio)
	 * or a string URL to an audio file.
	 */
	registerVariations(key, entries) {
		if (!Array.isArray(entries)) return;
		this.variations[key] = entries.slice();
	}

	loop(key) {
		const audio = this.sounds[key];
		if (audio) {
			audio.loop = true;
			if (!this.muted) audio.play().catch(() => { });
			return;
		}
		// WebAudio loop not implemented for synths in this simple manager
	}

	stop(key) {
		const audio = this.sounds[key];
		if (audio) {
			audio.pause();
			audio.currentTime = 0;
		}
	}

	setVolume(v) {
		this.volume = Math.max(0, Math.min(1, v));
		// propagate to loaded audio elements
		for (const k of Object.keys(this.sounds)) {
			try { this.sounds[k].volume = this.volume; } catch (e) { }
		}
	}

	mute() { this.muted = true; }
	unmute() { this.muted = false; }
	toggleMute() { this.muted = !this.muted; }

	// --- internal synthetic sounds ---
	_prepareSynthetic() {
		// click: create multiple small variations
		this.synthetic['click_var_1'] = () => {
			const ctx = this.ctx;
			const length = 0.03 + Math.random() * 0.02; // 30-50ms
			const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < data.length; i++) {
				const env = 1 - i / data.length;
				data[i] = (Math.random() * 2 - 1) * env * (0.3 + Math.random() * 0.4);
			}
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			const gain = ctx.createGain();
			gain.gain.value = this.volume * (0.6 + Math.random() * 0.6);
			src.connect(gain).connect(ctx.destination);
			src.start();
		};

		this.synthetic['click_var_2'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = Math.random() > 0.5 ? 'square' : 'triangle';
			osc.frequency.setValueAtTime(1200 + Math.random() * 800, now);
			osc.frequency.exponentialRampToValueAtTime(400 + Math.random() * 300, now + 0.02 + Math.random() * 0.03);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.08 * this.volume, now + 0.005);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.06);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(now + 0.08 + Math.random() * 0.06);
		};

		this.synthetic['click_var_3'] = () => {
			const ctx = this.ctx;
			// short filtered noise pop
			const bufferSize = Math.floor(ctx.sampleRate * (0.02 + Math.random() * 0.04));
			const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < data.length; i++) {
				const env = 1 - i / data.length;
				data[i] = (Math.random() * 2 - 1) * env * 0.5;
			}
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			const biquad = ctx.createBiquadFilter();
			biquad.type = 'highpass';
			biquad.frequency.value = 900 + Math.random() * 1200;
			const gain = ctx.createGain();
			gain.gain.value = this.volume * (0.5 + Math.random() * 0.5);
			src.connect(biquad).connect(gain).connect(ctx.destination);
			src.start();
		};

		// open: short rising sine
		this.synthetic['open'] = () => {
			const ctx = this.ctx;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			const now = ctx.currentTime;
			osc.frequency.setValueAtTime(400, now);
			osc.frequency.exponentialRampToValueAtTime(1000, now + 0.12);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(now + 0.2);
		};

		// close: short falling sine
		this.synthetic['close'] = () => {
			const ctx = this.ctx;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			const now = ctx.currentTime;
			osc.frequency.setValueAtTime(1000, now);
			osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(now + 0.2);
		};

		// open and close remain as before
		this.synthetic['open'] = () => {
			const ctx = this.ctx;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			const now = ctx.currentTime;
			osc.frequency.setValueAtTime(400, now);
			osc.frequency.exponentialRampToValueAtTime(1000, now + 0.12);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(now + 0.2);
		};

		this.synthetic['close'] = () => {
			const ctx = this.ctx;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			const now = ctx.currentTime;
			osc.frequency.setValueAtTime(1000, now);
			osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(now + 0.2);
		};

		// --- status / feedback sounds ---
		this.synthetic['stat_up'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'sine';
			o.frequency.setValueAtTime(600, now);
			o.frequency.exponentialRampToValueAtTime(900, now + 0.08);
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(now + 0.14);
		};

		this.synthetic['stat_down'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'sawtooth';
			o.frequency.setValueAtTime(400, now);
			o.frequency.exponentialRampToValueAtTime(200, now + 0.12);
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.1 * this.volume, now + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(now + 0.16);
		};

		this.synthetic['money_up'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, now);
			g.gain.linearRampToValueAtTime(0.12 * this.volume, now + 0.005);
			const freqs = [900, 1100, 1300];
			freqs.forEach((f, i) => {
				const o = ctx.createOscillator();
				o.type = 'triangle';
				o.frequency.setValueAtTime(f, now + i * 0.03);
				o.connect(g).connect(ctx.destination);
				o.start(now + i * 0.03);
				o.stop(now + i * 0.03 + 0.06);
			});
		};

		this.synthetic['money_down'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'sine';
			o.frequency.setValueAtTime(300, now);
			g.gain.setValueAtTime(0.0001, now);
			g.gain.linearRampToValueAtTime(0.08 * this.volume, now + 0.01);
			g.gain.linearRampToValueAtTime(0.0001, now + 0.12);
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(now + 0.12);
		};

		this.synthetic['cp_up'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'sine';
			o.frequency.setValueAtTime(700, now);
			o.frequency.exponentialRampToValueAtTime(1000, now + 0.06);
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.11 * this.volume, now + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(now + 0.14);
		};

		this.synthetic['cp_down'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'triangle';
			o.frequency.setValueAtTime(450, now);
			o.frequency.exponentialRampToValueAtTime(350, now + 0.08);
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.08 * this.volume, now + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(now + 0.14);
		};

		this.synthetic['item_get'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const freqs = [1200, 1500];
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.005);
			freqs.forEach((f, i) => {
				const o = ctx.createOscillator();
				o.type = 'square';
				o.frequency.setValueAtTime(f, now + i * 0.03);
				o.connect(g).connect(ctx.destination);
				o.start(now + i * 0.03);
				o.stop(now + i * 0.03 + 0.06);
			});
		};

		this.synthetic['alert'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'sawtooth';
			o.frequency.setValueAtTime(400, now);
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.14 * this.volume, now + 0.01);
			g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(now + 0.2);
		};

		// item use: distinct short sound (noise whoosh + metallic chime + subtle low thud)
		this.synthetic['item_use'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			// short filtered noise whoosh
			const bufLen = Math.floor(ctx.sampleRate * (0.04 + Math.random() * 0.03));
			const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
			const data = buf.getChannelData(0);
			for (let i = 0; i < data.length; i++) {
				const env = 1 - i / data.length;
				data[i] = (Math.random() * 2 - 1) * env * (0.45 + Math.random() * 0.35);
			}
			const src = ctx.createBufferSource();
			src.buffer = buf;
			const bp = ctx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = 900 + Math.random() * 800;
			bp.Q.value = 0.8 + Math.random() * 1.2;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.09 * this.volume, now + 0.004);
			g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.random() * 0.03);
			src.connect(bp).connect(g).connect(ctx.destination);
			src.start(now);

			// metallic chime: short descending triangle
			const o = ctx.createOscillator();
			o.type = 'triangle';
			o.frequency.setValueAtTime(1700 + Math.random() * 400, now + 0.01);
			o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 300, now + 0.12);
			const g2 = ctx.createGain();
			g2.gain.setValueAtTime(0.0001, now);
			g2.gain.exponentialRampToValueAtTime(0.07 * this.volume, now + 0.02);
			g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			o.connect(g2).connect(ctx.destination);
			o.start(now + 0.01);
			o.stop(now + 0.18);

			// subtle low thud to add weight
			const o2 = ctx.createOscillator();
			o2.type = 'sine';
			o2.frequency.setValueAtTime(110 + Math.random() * 40, now + 0.02);
			const g3 = ctx.createGain();
			g3.gain.setValueAtTime(0.0001, now);
			g3.gain.exponentialRampToValueAtTime(0.035 * this.volume, now + 0.02);
			g3.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
			o2.connect(g3).connect(ctx.destination);
			o2.start(now + 0.02);
			o2.stop(now + 0.12);
		};

		// game start: pleasant rising arpeggio
		this.synthetic['game_start'] = () => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, now);
			g.gain.exponentialRampToValueAtTime(0.14 * this.volume, now + 0.02);
			const freqs = [520, 780, 1040];
			freqs.forEach((f, i) => {
				const o = ctx.createOscillator();
				o.type = 'sine';
				o.frequency.setValueAtTime(f, now + i * 0.08);
				o.connect(g).connect(ctx.destination);
				o.start(now + i * 0.08);
				o.stop(now + i * 0.08 + 0.18);
			});
		};
	}
}

// export

window.soundManager = new SoundManager();

// Register default synthetic click variations only
try {
	const sm = window.soundManager;
	const variations = [];
	['click_var_1', 'click_var_2', 'click_var_3'].forEach(k => {
		if (sm.synthetic && typeof sm.synthetic[k] === 'function') variations.push(sm.synthetic[k].bind(sm));
	});
	if (variations.length > 0) sm.registerVariations('click', variations);
} catch (e) { console.warn('Failed to register click variations', e); }

// 注意: サウンドファイルはプロジェクトに配置された時にのみ
// 明示的に load() を呼んで読み込んでください。現在は自動読み込みは行いません。
