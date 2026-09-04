#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildInfoPath = path.resolve(__dirname, '../src/build-info.json');

let buildInfo = {
  version: "0.1.0-beta",
  buildNumber: "000F", // will increment to 0010 on first build if missing
  buildDate: new Date().toISOString().slice(0, 10)
};

if (fs.existsSync(buildInfoPath)) {
  try {
    buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  } catch (err) {
    console.warn('[bump-build] Failed to read existing build-info.json, creating new one.');
  }
}

// Check if we should skip increment (e.g. check only)
const shouldIncrement = !process.argv.includes('--no-bump');

if (shouldIncrement) {
  const currentHex = buildInfo.buildNumber || "000F";
  const currentInt = parseInt(currentHex, 16);
  const nextInt = isNaN(currentInt) ? 0x0010 : currentInt + 1;
  buildInfo.buildNumber = nextInt.toString(16).toUpperCase().padStart(4, '0');
  buildInfo.buildDate = new Date().toISOString().slice(0, 10);
}

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n', 'utf8');
console.log(`[build-info] Version: ${buildInfo.version}, Build: ${buildInfo.buildNumber} (${buildInfo.buildDate})`);
