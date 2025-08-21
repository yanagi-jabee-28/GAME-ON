(function () {
	const ctxState = { ctx: null, master: null, muted: false, volume: 0.5 };
	function ensureCtx() {
		if (ctxState.ctx) return ctxState;
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) return ctxState;
		const ctx = new AudioCtx();
		const master = ctx.createGain();
		master.gain.value = window.CONFIG ? window.CONFIG.MASTER_VOLUME : 0.5;
		master.connect(ctx.destination);
		ctxState.ctx = ctx; ctxState.master = master; ctxState.muted = !!(window.CONFIG && window.CONFIG.MUTED);
		return ctxState;
	}
	function sfxSimple({ freq = 440, type = 'sine', gain = 0.6, dur = 0.1 } = {}, when = 0) {
		ensureCtx();
		const { ctx, master } = ctxState; if (!ctx || !master) return;
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = type; osc.frequency.value = freq;
		g.gain.value = (ctxState.muted ? 0 : gain);
		osc.connect(g); g.connect(master);
		const now = ctx.currentTime + when;
		osc.start(now);
		// quick env
		g.gain.setValueAtTime(g.gain.value, now);
		g.gain.exponentialRampToValueAtTime(0.001, now + dur);
		osc.stop(now + dur + 0.01);
	}
	function setMuted(m) { ensureCtx(); ctxState.muted = !!m; }
	function setVolume(v) { ensureCtx(); ctxState.volume = v; if (ctxState.master) ctxState.master.gain.value = v; }
	window.AudioBus = { ensureCtx, sfxSimple, setMuted, setVolume };
})();
