(function () {
	'use strict';
	// lightweight on-canvas editor that talks to window.EDITOR
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
	document.getElementById('export-pegs').addEventListener('click', () => {
		const data = window.EDITOR.exportPegs();
		prompt('Pegs JSON', data);
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
			// remove at click
			const removed = window.EDITOR.removePegAt(x, y, 12);
			console.log('removePegAt', removed);
			if (!removed) {
				const b = window.EDITOR.findPegUnder(x, y, 16);
				console.log('findPegUnder fallback', b);
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
