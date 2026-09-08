#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Usage: npm run set-version <version>');
  console.error('Example: npm run set-version 0.1.2-beta');
  process.exit(1);
}

const cargoVersion = newVersion.split('-')[0];

console.log(`[set-version] Setting version to: ${newVersion} (Cargo: ${cargoVersion})`);

// 1. package.json
const pkgPath = path.join(rootDir, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('  ✓ package.json');
}

// 2. package-lock.json
const pkgLockPath = path.join(rootDir, 'package-lock.json');
if (fs.existsSync(pkgLockPath)) {
  const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8'));
  pkgLock.version = newVersion;
  if (pkgLock.packages && pkgLock.packages['']) {
    pkgLock.packages[''].version = newVersion;
  }
  fs.writeFileSync(pkgLockPath, JSON.stringify(pkgLock, null, 2) + '\n', 'utf8');
  console.log('  ✓ package-lock.json');
}

// 3. tauri.conf.json
const tauriConfPath = path.join(rootDir, 'src-tauri/tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = newVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  console.log('  ✓ src-tauri/tauri.conf.json');
}

// 4. build-info.json
const buildInfoPath = path.join(rootDir, 'src/build-info.json');
if (fs.existsSync(buildInfoPath)) {
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  buildInfo.version = newVersion;
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n', 'utf8');
  console.log('  ✓ src/build-info.json');
}

// 5. bump-build.js fallback
const bumpBuildPath = path.join(rootDir, 'scripts/bump-build.js');
if (fs.existsSync(bumpBuildPath)) {
  let content = fs.readFileSync(bumpBuildPath, 'utf8');
  content = content.replace(/version:\s*"[^"]+"/, `version: "${newVersion}"`);
  fs.writeFileSync(bumpBuildPath, content, 'utf8');
  console.log('  ✓ scripts/bump-build.js');
}

// 6. src-tauri/Cargo.toml
const cargoTomlPath = path.join(rootDir, 'src-tauri/Cargo.toml');
if (fs.existsSync(cargoTomlPath)) {
  let content = fs.readFileSync(cargoTomlPath, 'utf8');
  content = content.replace(/(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/, `$1"${cargoVersion}"`);
  content = content.replace(/(rapidready-core\s*=\s*\{[^}]*version\s*=\s*)"[^"]+"/, `$1"${cargoVersion}"`);
  fs.writeFileSync(cargoTomlPath, content, 'utf8');
  console.log('  ✓ src-tauri/Cargo.toml');
}

// 7. src-tauri/crates/rapidready-core/Cargo.toml
const coreCargoTomlPath = path.join(rootDir, 'src-tauri/crates/rapidready-core/Cargo.toml');
if (fs.existsSync(coreCargoTomlPath)) {
  let content = fs.readFileSync(coreCargoTomlPath, 'utf8');
  content = content.replace(/(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/, `$1"${cargoVersion}"`);
  fs.writeFileSync(coreCargoTomlPath, content, 'utf8');
  console.log('  ✓ src-tauri/crates/rapidready-core/Cargo.toml');
}

// 8. docs/VERSIONING.md
const versioningMdPath = path.join(rootDir, 'docs/VERSIONING.md');
if (fs.existsSync(versioningMdPath)) {
  let content = fs.readFileSync(versioningMdPath, 'utf8');
  content = content.replace(/(\* \*\*Current Authoritative Version:\*\* `)[^`]+(`)/, `$1${newVersion}$2`);
  fs.writeFileSync(versioningMdPath, content, 'utf8');
  console.log('  ✓ docs/VERSIONING.md');
}

console.log(`\n[set-version] All files successfully updated to ${newVersion}!`);
