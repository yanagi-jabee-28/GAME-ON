#!/usr/bin/env node
// Usage:
// 1) Pipe JSON into the script and provide output name:
//    cat mypreset.json | node src/js/write-preset.js default.json
// 2) Or provide an input file then output name:
//    node src/js/write-preset.js default.json input.json

const fs = require('fs');
const path = require('path');

function usage() {
	console.error('Usage: node src/js/write-preset.js <out-filename.json> [in-file.json]');
	process.exit(1);
}

if (process.argv.length < 3) usage();
const outName = process.argv[2];
if (!outName.endsWith('.json')) {
	console.error('Output filename must end with .json');
	process.exit(1);
}
const outDir = path.join(__dirname, '..', 'pegs-presets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, outName);

function writeJson(text) {
	try {
		const j = JSON.parse(text);
		const pretty = JSON.stringify(j, null, 2);
		fs.writeFileSync(outPath, pretty, 'utf8');
		console.log('Wrote preset to', outPath);
	} catch (e) {
		console.error('Invalid JSON:', e.message);
		process.exit(1);
	}
}

if (process.argv[3]) {
	const inFile = process.argv[3];
	if (!fs.existsSync(inFile)) { console.error('Input file not found:', inFile); process.exit(1); }
	const txt = fs.readFileSync(inFile, 'utf8');
	writeJson(txt);
} else {
	// read stdin
	let data = '';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', chunk => data += chunk);
	process.stdin.on('end', () => {
		if (!data) { console.error('No input on stdin. Provide JSON via stdin or supply an input file.'); usage(); }
		writeJson(data);
	});
}
