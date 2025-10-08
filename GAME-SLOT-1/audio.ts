/*
 * SlotSoundManager: スロット用のオーディオ管理（WebAudioベース）
 * - マスター音量と、音種別（spinStart/reelStop/win）ごとの個別音量をサポート
 * - 外部ファイル指定がある場合はプリロードして再生、なければ簡易合成音でフォールバック
 */
export class SlotSoundManager {
	config: any;
	enabled: boolean;
	masterVolume: number;
	perVolume: { [key: string]: number };
	files: { [key: string]: string };
	ctx: AudioContext | null;
	buffers: { [key: string]: AudioBuffer };
	_loopTimer: any;
	constructor(config) {
		this.config = config || {};
		this.enabled = Boolean(this.config.sounds?.enabled);
		this.masterVolume = Number(this.config.sounds?.volume ?? 0.8);
		const v = this.config.sounds?.volumes || {};
		this.perVolume = {
			spinStart: (typeof v.spinStart === 'number') ? v.spinStart : 1.0,
			reelStop: (typeof v.reelStop === 'number') ? v.reelStop : 0.5, // 既定で半分
			win: (typeof v.win === 'number') ? v.win : 1.0,
		};
		this.files = this.config.sounds?.files || {};
		this.ctx = null;
		this.buffers = {};
		this._loopTimer = null;
		if (this.enabled) this._init();
	}

	async _init() {
		try {
			// Cast window to any to allow non-standard webkitAudioContext while keeping runtime behavior
			const Win = /** @type {any} */ (window);
			this.ctx = new (Win.AudioContext || Win.webkitAudioContext)();
			for (const key of ['spinStart', 'reelStop', 'win']) {
				const path = this.files[key];
				if (path) {
					try {
						const res = await fetch(path);
						const ab = await res.arrayBuffer();
						const buf = await this.ctx.decodeAudioData(ab.slice(0));
						this.buffers[key] = buf;
					} catch (e) {
						console.warn('Sound preload failed for', key, e);
					}
				}
			}
		} catch (e) {
			console.warn('WebAudio init failed, sound disabled', e);
			this.enabled = false;
		}
	}

	_clampVol(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }
	_finalVol(kind) { return this._clampVol(this.masterVolume * (this.perVolume?.[kind] ?? 1)); }

	_playBuffer(buf, finalVol) {
		if (!this.enabled || !this.ctx) return;
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		const gain = this.ctx.createGain();
		gain.gain.value = this._clampVol(finalVol);
		src.connect(gain).connect(this.ctx.destination);
		src.start();
	}

	_synthBeep(freq = 440, dur = 0.1, type: OscillatorType = 'sine', finalVol = this.masterVolume) {
		if (!this.ctx) return;
		const o = this.ctx.createOscillator();
		const g = this.ctx.createGain();
		o.type = type;
		o.frequency.value = freq;
		const vol = this._clampVol(finalVol);
		g.gain.value = vol;
		o.connect(g).connect(this.ctx.destination);
		const now = this.ctx.currentTime;
		g.gain.setValueAtTime(0.0001, now);
		g.gain.linearRampToValueAtTime(vol, now + Math.min(0.01, dur / 4));
		o.start(now);
		g.gain.linearRampToValueAtTime(0.0001, now + dur);
		o.stop(now + dur + 0.02);
	}

	_synthSequence(freqs = [440, 660], dur = 0.12, finalVol = this.masterVolume) {
		if (!this.ctx) return;
		let t = this.ctx.currentTime;
		const vol = this._clampVol(finalVol);
		for (const f of freqs) {
			const o = this.ctx.createOscillator();
			const g = this.ctx.createGain();
			o.type = 'sine';
			o.frequency.value = f;
			g.gain.value = vol;
			o.connect(g).connect(this.ctx.destination);
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
			o.start(t);
			g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
			o.stop(t + dur + 0.02);
			t += dur;
		}
	}

	playSpinStart() {
		if (!this.enabled) return;
		const vol = this._finalVol('spinStart');
		if (this.buffers.spinStart) return this._playBuffer(this.buffers.spinStart, vol);
		this._synthSequence([210, 290, 370], 0.07, vol);
		setTimeout(() => this._synthBeep(140, 0.08, 'sine', this._clampVol(vol * 0.5)), 140);
	}

	playReelStop() {
		if (!this.enabled) return;
		const vol = this._finalVol('reelStop');
		if (this.buffers.reelStop) return this._playBuffer(this.buffers.reelStop, vol);
		this._synthBeep(800, 0.08, 'square', vol);
	}

	playWin() {
		if (!this.enabled) return;
		const vol = this._finalVol('win');
		if (this.buffers.win) return this._playBuffer(this.buffers.win, vol);
		this._synthSequence([600, 900, 1200], 0.12, vol);
	}

	loopStart() {
		if (!this.enabled || !this.ctx) return;
		if (this._loopTimer) return;
		const pattern = [880, 740, 660, 740];
		let idx = 0;
		const intervalMs = 100;
		this._loopTimer = setInterval(() => {
			const f = pattern[idx % pattern.length];
			idx++;
			const vol = this._clampVol(this._finalVol('spinStart') * 0.18);
			this._synthBeep(f, 0.06, 'square', vol);
		}, intervalMs);
	}

	loopStop() {
		if (this._loopTimer) {
			clearInterval(this._loopTimer);
			this._loopTimer = null;
		}
	}

	// --- 外部から音量を動的に変更するためのAPI ---
	/**
	 * マスター音量を設定します。
	 * @param {number} volume - 新しいマスター音量 (0.0 - 1.0)
	 */
	setMasterVolume(volume) {
		if (typeof volume === 'number') {
			this.masterVolume = this._clampVol(volume);
			console.log(`[SlotSoundManager] Master volume set to: ${this.masterVolume}`);
		}
	}

	/**
	 * 特定のサウンドの個別音量を設定します。
	 * @param {string} kind - サウンドの種類 ('spinStart', 'reelStop', 'win')
	 * @param {number} volume - 新しい個別音量 (0.0 - 1.0)
	 */
	setPerVolume(kind, volume) {
		if (this.perVolume.hasOwnProperty(kind) && typeof volume === 'number') {
			this.perVolume[kind] = this._clampVol(volume);
			console.log(`[SlotSoundManager] Volume for '${kind}' set to: ${this.perVolume[kind]}`);
		}
	}
}
