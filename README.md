<div align="center">
  <img src="RapidReady-logo.jpeg" alt="RapidReady Logo" width="600" />
  
  <h1>RapidReady</h1>
  <p><strong>The blazingly fast companion app for RapidRaw.</strong></p>
</div>

<br/>

## ⚡ What is RapidReady?

**RapidReady** is a lightning-fast, native desktop application designed to bridge the gap between camera media and your photo editing workflow. Built specifically as the ultimate companion tool for **RapidRaw**, it handles the heavy lifting of importing, organizing, and culling massive amounts of high-resolution RAW files with zero lag.

Photographers often shoot thousands of photos on a single job. RapidReady is built to ensure you never wait for a progress bar or a rendering thumbnail when you need to review your shots.

## 🚀 Key Features (Current & Planned)

- **Blazing Fast RAW Engine:** Powered by a custom Rust backend, RapidReady extracts embedded JPEGs from CR2, CR3, ARW, and other proprietary RAW formats instantly without slow decodes.
- **Zero-Latency Culling:** Navigate through massive folders of 45-megapixel RAW files in real-time. Pre-loading architecture ensures the next image is always ready before you press the spacebar.
- **Smart Import Workflows:** Define custom *Import Presets* and *Archive Locations*. Automatically rename files, create date-based subfolders, and verify copies from SD cards to SSDs.
- **Seamless RapidRaw Integration:** Deeply integrated with RapidRaw. Double-click an image to instantly launch it in RapidRaw with zero context switching.
- **Archive Health Dashboard:** Built-in tools to monitor the integrity of your photo archives, track past imports, and quickly identify missing or misaligned files.
- **Multilingual (i18n):** Native support for English and German interfaces.
- **Cross-Platform Foundation:** Built on [Tauri v2](https://v2.tauri.app/), [React](https://react.dev/), and [Rust](https://www.rust-lang.org/) for native OS performance with a beautiful, modern UI.

## 🛠️ Technology Stack

- **Backend:** Rust (Tauri)
- **Frontend:** React, TypeScript, Tailwind CSS, Zustand
- **Media Decoding:** Custom Rust image/thumbnail decoders
- **Database (Planned):** SQLite for lightning-fast Collections and Metadata querying

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI](https://v2.tauri.app/start/)

### Development

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/on370/RapidReady.git
   cd RapidReady
   \`\`\`
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
3. Run the development server:
   \`\`\`bash
   npm run tauri dev
   \`\`\`

## 📝 License
MIT License. Created by Ole N
