(function () {
	'use strict';
	// lightweight on-canvas editor that talks to window.EDITOR
	// Respect global config flag to disable editor at runtime
	if (!window.CONFIG || !window.CONFIG.EDITOR_ENABLED) {
		// Editor explicitly disabled in config
		return;
	}
	if (typeof window.EDITOR === 'undefined') {
		console.warn('EDITOR API not present');
		return;
	}

	const el = document.createElement('div');
	el.id = 'editor-panel';
	el.innerHTML = `
		<div class="editor-row"><button id="peg-toggle">Add Peg</button><button id="peg-clear">Clear Pegs</button><button id="toggle-symmetric">Symmetric: Off</button></div>
		<div class="editor-row"><button id="mode-delete">Select/Delete</button><button id="deselect">Deselect</button></div>
		<div class="editor-row"><button id="preset-none">Preset: None</button><button id="preset-default">Preset: Default</button></div>
		<div class="editor-row"><button id="export-pegs">Export</button><button id="import-pegs">Import</button></div>
	`;
	document.body.appendChild(el);

	let adding = true;
	let deleteMode = false;
	let symmetricMode = false;
	let selectedPeg = null;
	const canvas = document.getElementById('pachinko-canvas');
	const rect = () => canvas.getBoundingClientRect();
	const toCanvasCoords = (clientX, clientY) => {
		const r = rect();
		// account for CSS scaling: use canvas.width/rect.width
		const scaleX = canvas.width / r.width;
		const scaleY = canvas.height / r.height;
		const x = (clientX - r.left) * scaleX;
		const y = (clientY - r.top) * scaleY;
		return { x, y };
	};

	document.getElementById('peg-toggle').addEventListener('click', () => { adding = !adding; deleteMode = false; document.getElementById('peg-toggle').textContent = adding ? 'Add Peg' : 'Remove Peg'; document.getElementById('mode-delete').textContent = 'Select/Delete'; selectedPeg = null; });
	document.getElementById('peg-clear').addEventListener('click', () => { window.EDITOR.clearPegs(); selectedPeg = null; });
	document.getElementById('toggle-symmetric').addEventListener('click', () => { symmetricMode = !symmetricMode; document.getElementById('toggle-symmetric').textContent = symmetricMode ? 'Symmetric: On' : 'Symmetric: Off'; });
	document.getElementById('mode-delete').addEventListener('click', () => { deleteMode = true; adding = false; document.getElementById('mode-delete').textContent = 'Delete Mode'; document.getElementById('peg-toggle').textContent = 'Add Peg'; });
	document.getElementById('deselect').addEventListener('click', () => { selectedPeg = null; });
	document.getElementById('preset-none').addEventListener('click', () => { window.setPegPreset('none'); });
	document.getElementById('preset-default').addEventListener('click', () => { window.setPegPreset('default'); });

	// dynamic presets from src/pegs-presets/presets.json
	fetch('src/pegs-presets/presets.json').then(r => {
		if (!r.ok) throw new Error('presets manifest fetch failed');
		return r.json();
	}).then(list => {
		if (!Array.isArray(list)) return;
		const row = document.createElement('div'); row.className = 'editor-row';
		list.forEach(fn => {
			const name = fn.replace(/\.json$/i, '');
			const btn = document.createElement('button'); btn.textContent = 'Preset: ' + name; btn.style.marginRight = '6px';
			btn.addEventListener('click', () => {
				fetch('src/pegs-presets/' + fn).then(r2 => { if (!r2.ok) throw new Error('preset fetch failed'); return r2.json(); }).then(data => {
					window.EDITOR.importPegs(data);
					console.log('imported preset', fn);
				}).catch(e => { alert('Failed to load preset: ' + fn + '\n' + e.message); });
			});
			row.appendChild(btn);
		});
		el.appendChild(row);
	}).catch(e => { console.warn('could not load presets manifest', e); });
	document.getElementById('export-pegs').addEventListener('click', async () => {
		const data = window.EDITOR.exportPegs();
		// trigger download
		try {
			const blob = new Blob([data], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'pegs-export.json';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (e) { console.warn('download failed', e); }
		// copy to clipboard if available
		try { await navigator.clipboard.writeText(data); console.log('Pegs JSON copied to clipboard'); } catch (e) { console.warn('clipboard copy failed', e); }
		// show quick instruction to add it to repo via script
		alert('Exported pegs JSON and copied to clipboard.\nTo add as a preset in the repo, save the downloaded file into src/pegs-presets and run the helper script:\n\nnode scripts/write-preset.js mypreset.json\n\nor pipe the JSON into the script. See repository scripts/write-preset.js');
	});
	document.getElementById('import-pegs').addEventListener('click', () => {
		const txt = prompt('Paste pegs JSON');
		if (!txt) return; window.EDITOR.importPegs(txt);
	});

	canvas.addEventListener('click', (e) => {
		// compute both client and canvas coords for debugging
		const clientX = e.clientX, clientY = e.clientY;
		const r = rect();
		let p = toCanvasCoords(clientX, clientY);
		// fallback: if computed coords are NaN or rect width/height zero, use client coords offset
		if (!isFinite(p.x) || !isFinite(p.y) || r.width === 0 || r.height === 0) {
			p = { x: clientX - r.left, y: clientY - r.top };
		}
		const x = p.x, y = p.y;
		console.log('editor click', { clientX, clientY, rect: r, canvasX: x, canvasY: y, adding, deleteMode });

		// visual marker to help debug where the click mapped to
		const mark = document.createElement('div');
		mark.style.position = 'absolute';
		mark.style.left = (clientX - 4) + 'px';
		mark.style.top = (clientY - 4) + 'px';
		mark.style.width = '8px';
		mark.style.height = '8px';
		mark.style.borderRadius = '50%';
		mark.style.background = 'rgba(255,0,0,0.9)';
		mark.style.zIndex = 20000;
		document.body.appendChild(mark);
		setTimeout(() => mark.remove(), 800);

		if (adding) {
			const b = window.EDITOR.addPeg(x, y);
			console.log('addPeg result', b);
			if (symmetricMode && canvas && typeof canvas.width === 'number') {
				try {
					const mirrorX = Math.round(canvas.width - x);
					// avoid duplicating when clicking very close to center
					if (Math.abs(mirrorX - x) > 1) {
						const b2 = window.EDITOR.addPeg(mirrorX, y);
						console.log('addPeg symmetric result', b2, 'mirrorX', mirrorX);
					}
				} catch (e) { console.warn('symmetric add failed', e); }
			}
			// diagnostic: if a body was created, draw a persistent green marker at the
			// body's rendered position (maps world coords back to client coords)
			try {
				if (b && b.position && canvas) {
					const r2 = rect();
					if (r2.width > 0 && r2.height > 0 && isFinite(canvas.width) && isFinite(canvas.height)) {
						const scaleX2 = canvas.width / r2.width;
						const scaleY2 = canvas.height / r2.height;
						const clientX2 = r2.left + (b.position.x / scaleX2);
						const clientY2 = r2.top + (b.position.y / scaleY2);
						const mark2 = document.createElement('div');
						mark2.style.position = 'absolute';
						mark2.style.left = (clientX2 - 6) + 'px';
						mark2.style.top = (clientY2 - 6) + 'px';
						mark2.style.width = '12px';
						mark2.style.height = '12px';
						mark2.style.borderRadius = '50%';
						mark2.style.background = 'rgba(0,200,0,0.9)';
						mark2.style.zIndex = 20000;
						document.body.appendChild(mark2);
						setTimeout(() => mark2.remove(), 3000);
					}
				}
			} catch (e) { console.warn('marker draw failed', e); }
		} else if (deleteMode) {
			// select nearest peg
			const body = window.EDITOR.findPegUnder(x, y, 16);
			console.log('findPegUnder', body);
			if (body) {
				selectedPeg = body;
			}
		} else {
			// remove at click: prefer client-based removal to avoid canvas scaling mismatches
			const thr = 20; // increased tolerance for easier removal
			let removed = false;
			if (typeof window.EDITOR.removePegAtClient === 'function') {
				removed = window.EDITOR.removePegAtClient(clientX, clientY, thr);
			} else {
				removed = window.EDITOR.removePegAt(x, y, thr);
			}
			console.log('remove client-based result', removed);
			if (removed) {
				// quick visual confirmation at click location
				const h = document.createElement('div');
				h.style.position = 'absolute';
				h.style.left = (clientX - 10) + 'px';
				h.style.top = (clientY - 10) + 'px';
				h.style.width = '20px';
				h.style.height = '20px';
				h.style.borderRadius = '50%';
				h.style.border = '2px solid rgba(231,76,60,0.95)';
				h.style.background = 'rgba(231,76,60,0.12)';
				h.style.zIndex = 20000;
				document.body.appendChild(h);
				setTimeout(() => h.remove(), 300);
			} else {
				// fallback: select nearest for manual deletion
				const b = window.EDITOR.findPegUnder(x, y, 28);
				if (b) selectedPeg = b;
			}
		}
	});

	// delete-selected feature removed per request

	// make panel draggable
	el.addEventListener('mousedown', function (ev) {
		ev.preventDefault();
		const startX = ev.clientX, startY = ev.clientY;
		const startLeft = el.offsetLeft, startTop = el.offsetTop;
		function onMove(mv) { el.style.left = (startLeft + (mv.clientX - startX)) + 'px'; el.style.top = (startTop + (mv.clientY - startY)) + 'px'; }
		function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
		window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
	});

})();
