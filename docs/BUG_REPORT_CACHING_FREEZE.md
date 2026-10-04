# Bug Report: Analyse der Caching-Updates & UI-Freezes

Die vorherige Analyse war fehlerhaft und hat die tatsächliche Ursache komplett übersehen. Die echten Probleme basieren auf einer übersehenen *uncommitted* Änderung im Sortier-Algorithmus, die den Main-Thread blockiert, sowie auf fehlerhafter Datums-Logik.

Hier sind die korrigierten Ergebnisse der Untersuchung:

## 1. UI-Freeze & Blockade während des Indizierens
**Ursache:** Main-Thread-Blockade durch extrem langsamen Sortier-Algorithmus in `LibraryCenter.tsx`.

In den uncommitted Changes wurde die Sortierung in `LibraryCenter.tsx` (`displayedImages` useMemo) heimlich von einer simplen String-Sortierung zu folgender komplexen Logik geändert:
```typescript
// True chronological / hierarchical sorting:
return list.slice().sort((a, b) => {
  // 1. If both images have a capture date, sort chronologically
  if (a.date && b.date) {
    const dCmp = a.date.localeCompare(b.date);
    if (dCmp !== 0) return dCmp;
  } else if (a.date) {
    return -1;
  } else if (b.date) {
    return 1;
  }
  // 2. Fallback: Natural path sorting
  return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
});
```
**Das Problem:** `localeCompare` mit den Optionen `{ numeric: true, sensitivity: 'base' }` ist in JavaScript (V8) extrem langsam. Während des Indizierens (Scannens) feuert das Backend kontinuierlich Chunks mit neuen Bildern an das Frontend. Bei jedem Chunk wird `displayedImages` neu berechnet und die gesamte Liste (potenziell Zehntausende Bilder) auf dem Main Thread neu sortiert. 
Das lastet den JS Main Thread zu 100% aus, was dazu führt, dass React keine State-Updates (wie das Hochzählen) mehr rendern kann, die UI komplett einfriert (Klicks reagieren nicht) und man nicht mehr scrollen kann.

## 2. Falsche Sortierung nach dem Indizieren
**Ursache:** Inkonsistente Behandlung von Bildern mit und ohne `date` im selben Sortier-Algorithmus.

Die vorherige These, dass IPC-Flooding Tauri-Events "verschluckt" und deshalb Bilder in der falschen Reihenfolge erscheinen, ist falsch. Der Fehler liegt direkt im neuen Sortier-Code:
- Wenn Bilder während des ersten schnellen Scans geladen werden, fehlt bei vielen oft noch das `date` (da EXIF-Metadaten asynchron später gelesen werden).
- Bilder mit `date` bekommen per `return -1;` den absoluten Vorrang.
- Sobald Metadaten nachgeladen werden und ein Bild sein `date` erhält, springt es bei der nächsten Neu-Berechnung der Liste plötzlich ganz nach vorne. 
Das führt dazu, dass die Grid-Sortierung chaotisch und völlig kaputt wirkt.

## 3. (Sekundär) IPC-Flooding beim Scrollen
Die Beobachtung der vorherigen Analyse zum `onScroll`-Handler in `LibraryGrid.tsx` ist im Ansatz korrekt, war aber *nicht* der Auslöser des Freezes *während* der Indizierung (da man währenddessen wegen des blockierten Main-Threads gar nicht scrollen kann). 

Trotzdem:
```typescript
// Invalidate active background warmup immediately on movement
setTopCount(0);
setBottomCount(0);
warmupTokenRef.current = Date.now();
// ... clearTimeout ...
invoke('cancel_warmup_cache').catch(() => {});
```
Dieser Aufruf bei *jedem einzelnen* Scroll-Frame überlastet den Tauri IPC-Channel massiv und führt beim normalen schnellen Durchscrollen (nach dem Scan) zu Lags.

---

### Empfohlene nächste Schritte für das Coding Model:

1. **Performante Sortierung in `LibraryCenter.tsx` wiederherstellen:** 
   Entfernen Sie die `{ numeric: true, sensitivity: 'base' }` Optionen für große Arrays. Ein einfacher `a.path > b.path ? 1 : -1` Vergleich ist Größenordnungen schneller. Falls chronologisch sortiert werden muss, sollte dies robuster gelöst werden (z.B. indem unvollständige Daten das Bild nicht einfach blind nach hinten schieben, oder durch Optimierungen wie vorberechnete Timestamps).
2. **IPC-Aufrufe im Grid drosseln (`LibraryGrid.tsx`):**
   Führen Sie ein `useRef`-Flag ein (z. B. `isWarmupRunning`), damit `invoke('cancel_warmup_cache')` im `onScroll` nur dann gefeuert wird, wenn wirklich aktiv ein Warmup im Hintergrund läuft.

### Remaining Questions & Gaps
- Es sollte tiefer untersucht werden, ob die Sortierung von großen Arrays (50.000+ Bilder) überhaupt komplett auf dem Frontend (Main Thread) stattfinden sollte, oder ob das Rust-Backend die Arrays bereits vorsortiert übergeben könnte, um die UI-Latenz auf null zu reduzieren.
- Die genaue Auswirkung des in den Container verschobenen `ArchiveScanBanner` auf das Z-Index-Layout muss im laufenden Zustand noch einmal geprüft werden, da es bei absolut positionierten Grids schnell zu Klick-Blockaden kommen kann.
