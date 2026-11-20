<!--
  RapidReady Incremental Release Notes Template
  Regeln:
  - Headline: Version + prägnante Schlagworte der AKTUELLEN Version {{VERSION}}.
  - Key Achievements: NUR (!) für die aktuelle Version {{VERSION}}, nur 1 kurzer Satz/Statement pro Punkt.
  - "What's New Since v{{BASE_VERSION}}": Inkrementelle Gesamtzusammenfassung ab {{BASE_VERSION}} bis {{VERSION}}.
  - Keine "hausgemachten" Entwicklungs-Zwischenfehler erwähnen; nur echte Features & echte Bugfixes.
  - Installationshinweise für macOS + Windows immer unverändert beibehalten (nur {{VERSION}} ersetzen).
-->

## RapidReady v{{VERSION}} — {{HEADLINE_KEYWORDS}}

### 🚀 Key Achievements (`v{{VERSION}}`)
- **{{ACHIEVEMENT_1_TITLE}}** — {{ACHIEVEMENT_1_ONE_LINER}}
- **{{ACHIEVEMENT_2_TITLE}}** — {{ACHIEVEMENT_2_ONE_LINER}}
- **{{ACHIEVEMENT_3_TITLE}}** — {{ACHIEVEMENT_3_ONE_LINER}}

---

### ✨ What's New Since v{{BASE_VERSION}}

#### {{SECTION_1_EMOJI}} {{SECTION_1_TITLE}} (`v{{VERSION}}`)
- **{{FEATURE_TITLE}}:** {{FEATURE_DESCRIPTION}}

#### {{SECTION_2_EMOJI}} {{SECTION_2_TITLE}} (`v{{PREV_PATCH_RANGE}}`)
- **{{CARRIED_FEATURE_TITLE}}:** {{CARRIED_FEATURE_DESCRIPTION}}

#### 🛠️ Bugfixes & Stability (`v{{PREV_PATCH_RANGE}}`–`v{{VERSION}}`)
- **{{FIX_TITLE}}:** {{FIX_DESCRIPTION}}

---

### 📥 Installation

#### macOS (Apple Silicon / Universal)
1. Download the `.dmg` installer (`RapidReady_{{VERSION}}_aarch64.dmg` or `RapidReady_{{VERSION}}_universal.dmg`).
2. Open the `.dmg` and drag **RapidReady** into your **Applications** folder.
3. **Gatekeeper Note (First Launch):** Since RapidReady is an open-source project without a paid Apple Developer certificate, macOS may show an *"unidentified developer"* warning. Run once in Terminal:
   ```bash
   xattr -cr /Applications/RapidReady.app
   ```
   *(Alternatively: Right-click `RapidReady.app` in Applications → **Open** → **Open**.)*

#### Windows (x64)
1. Download the setup executable (`RapidReady_{{VERSION}}_x64-setup.exe`).
2. Run the installer (user-level install, no admin rights required).
3. **SmartScreen Note:** Click **More info** → **Run anyway** if Windows SmartScreen prompts for an unsigned open-source binary.
