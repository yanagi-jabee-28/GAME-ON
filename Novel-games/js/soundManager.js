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
	load(key, src) {
		try {
			const audio = new Audio(src);
			audio.preload = 'auto';
			audio.volume = this.volume;
			// attach error handler to mark as not usable
			audio.addEventListener('error', () => {
				console.warn('Sound file failed to load, will use synthetic if available:', src);
				delete this.sounds[key];
			});
			this.sounds[key] = audio;
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
				const clone = audio.cloneNode();
				clone.volume = this.volume;
				clone.play().catch(() => { });
				return;
			} catch (e) {
				// fallback to synthetic
			}
		}

		// fallback: synthetic sound
		const synth = this.synthetic[key];
		if (synth && this.ctx) {
			try { synth(); } catch (e) { console.error(e); }
		}
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
	}

	mute() { this.muted = true; }
	unmute() { this.muted = false; }
	toggleMute() { this.muted = !this.muted; }

	// --- internal synthetic sounds ---
	_prepareSynthetic() {
		// click: short noise burst
		this.synthetic['click'] = () => {
			const ctx = this.ctx;
			const length = 0.03; // 30ms
			const buffer = ctx.createBuffer(1, ctx.sampleRate * length, ctx.sampleRate);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < data.length; i++) {
				// decaying white noise
				const env = 1 - i / data.length;
				data[i] = (Math.random() * 2 - 1) * env * 0.4;
			}
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			const gain = ctx.createGain();
			gain.gain.value = this.volume * 0.8;
			src.connect(gain).connect(ctx.destination);
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
	}
}

// export
window.soundManager = new SoundManager();

// Attempt to load project files; if missing, synthetic sounds will be used
window.soundManager.load('click', 'assets/sounds/click.mp3');
window.soundManager.load('open', 'assets/sounds/open.mp3');
window.soundManager.load('close', 'assets/sounds/close.mp3');
