# RapidReady Versioning & Build Scheme

This document defines the authoritative versioning guidelines, release identification, and automated build numbering for RapidReady.

---

## 1. Authoritative Marketing Version

The user-facing marketing version follows Semantic Versioning (`MAJOR.MINOR.PATCH[-PRERELEASE]`) and is **set manually** when preparing releases or reaching project milestones.

* **Current Authoritative Version:** `0.1.0-beta`

When updating the marketing version, it must be updated in the following central files:
1. `app/src/build-info.json` (`version` field)
2. `app/package.json` (`version` field)
3. `app/src-tauri/tauri.conf.json` (`version` field)
4. `app/src-tauri/Cargo.toml` (`[package] version = "0.1.0"`)

---

## 2. Internal Build Number Specification

RapidReady uses a strictly sequential, four-digit hexadecimal build number (`XXXX` in uppercase hex) to uniquely identify build artifacts:

* **Format:** 4-digit uppercase hexadecimal string (padded with leading zeros).
* **Starting Number:** `0010` (Hexadecimal `0x0010` = Decimal `16`).
* **Sequence Rules:** 
  - Standard hexadecimal arithmetic:
    `0010` → `0011` → `0012` → ... → `0019` → `001A` → `001B` → `001C` → `001D` → `001E` → `001F` → `0020` → `0021`...
  - After `001F`, the next build is `0020`.

---

## 3. Automated Increment Workflow

Build numbers are automatically incremented on each production build via the build script:

1. **Automated Bumping Script:**
   `app/scripts/bump-build.js` reads `app/src/build-info.json`, parses the current hexadecimal build number, adds `1`, formats it as a 4-digit uppercase hex string, and records the current build date.

2. **Triggering Builds:**
   Running `npm run build` automatically triggers the bump script before invoking TypeScript compilation and Vite packaging:
   ```bash
   npm run build
   # Executes: node scripts/bump-build.js && tsc && vite build
   ```

3. **Manual Bump or Inspection:**
   To increment the build number without triggering a full build, run:
   ```bash
   npm run bump-build
   ```

---

## 4. UI Display & Runtime Exposure

The version and build number are imported directly from `app/src/build-info.json` by the application UI (e.g., `AboutModal.tsx`):
* **Version Display:** `Version 0.1.0-beta`
* **Build Display:** `Build 0010` (monospaced)
