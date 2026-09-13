# Contributing to RapidReady

Thank you for your interest in contributing to **RapidReady**! We are building the ultimate high-speed ingest and culling tool for high-volume photographers, designed for zero-latency performance with massive RAW archives.

Whether you are fixing a bug, proposing a feature, adding camera format support, or refining documentation, your contributions are welcome!

---

## 🚀 Quick Start for Contributors

RapidReady is built with **Tauri v2**, **React 19**, **TypeScript**, and a native **Rust core** (`rapidready-core`).

### 1. Prerequisites
- **Node.js** v18+ or v20+ LTS
- **Rust toolchain** (stable via [rustup.rs](https://rustup.rs/))
- **OS-specific dependencies:**
  - **Windows:** Microsoft C++ Build Tools (MSVC v143) & WebView2. (See [Windows Platform Guide](docs/PLATFORM_WINDOWS.md))
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** WebKitGTK and build libraries. (See [Linux Platform Guide](docs/PLATFORM_LINUX.md))

### 2. Launching the Development Environment

We provide 1-click launch scripts in the [`scripts/`](scripts/) directory:

- **Windows:** Double-click [`scripts\dev.bat`](scripts/dev.bat) or run `scripts\dev.bat` in PowerShell.
- **macOS & Linux:** Run [`./scripts/dev.sh`](scripts/dev.sh) in your terminal.

Alternatively, via npm:
```bash
npm install
npm run tauri dev
```

---

## 📚 Architectural Guides & Documentation

Before diving into code, please familiarize yourself with our architectural documentation in [`docs/`](docs/):

- **[Architecture Guide (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md):** Deep dive into the Rust core, progressive RAW streaming, two-phase progressive NAS scanning, and sidecar adapters.
- **[Technical Roadmap & Backlog (`docs/ROADMAP.md`)](docs/ROADMAP.md):** Our detailed technical backlog, problem analyses, and upcoming milestones (including the persistent Picasa-style disk cache, universal XMP sidecar support, and native video pipeline).
- **[Platform Guides:](docs/)**
  - [Windows Setup & Build Guide](docs/PLATFORM_WINDOWS.md)
  - [Linux Setup & Packaging Guide](docs/PLATFORM_LINUX.md)
  - [Versioning & Build Numbering](docs/VERSIONING.md)

---

## 🧪 Testing & Quality Assurance

All contributions must pass existing tests and automated builds:

### Running Rust Core Unit Tests
```bash
cd src-tauri
cargo test -p rapidready-core
```

### Running TypeScript & Frontend Verification
```bash
npm run build
```

---

## 📝 Commit & PR Conventions

RapidReady follows [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(scope): ...` — New feature or capability
- `fix(scope): ...` — Bug fix
- `perf(scope): ...` — Performance optimization
- `docs(scope): ...` — Documentation updates
- `refactor(scope): ...` — Code refactoring without behavioral change
- `test(scope): ...` — Adding or updating tests
- `chore(scope): ...` — Tooling, dependencies, or version bumps

*Please write all commit messages, PR descriptions, and code comments in English.*

### Submitting a Pull Request
1. Fork the repository and create your feature branch: `git checkout -b feat/my-new-feature`
2. Ensure unit tests and frontend build pass without errors.
3. Commit your changes with conventional commit messages.
4. Push to your branch and open a Pull Request against `main`.
