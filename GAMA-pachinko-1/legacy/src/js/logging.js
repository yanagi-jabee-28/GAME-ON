// Lightweight runtime logging flags for debugging
// This file exposes `window.LOGGING` with defaults and helpers.
(function () {
	'use strict';
	window.LOGGING = window.LOGGING || {};
	// default flags (disable peg collision summary logging by default)
	window.LOGGING.pegCollisionSummary = (typeof window.LOGGING.pegCollisionSummary === 'boolean') ? window.LOGGING.pegCollisionSummary : false;
	window.LOGGING.pegHeatmap = (typeof window.LOGGING.pegHeatmap === 'boolean') ? window.LOGGING.pegHeatmap : false;

	window.LOGGING.toggle = (k, value) => {
		if (typeof value === 'boolean') {
			window.LOGGING[k] = value;
		} else {
			window.LOGGING[k] = !window.LOGGING[k];
		}
		return window.LOGGING[k];
	};
})();
