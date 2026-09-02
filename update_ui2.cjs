const fs = require('fs');
const path = 'src/components/views/import/ImportSourceStep.tsx';
let content = fs.readFileSync(path, 'utf8');

// Ensure useEffect and useState are imported
if (!content.includes('import { useState, useEffect }')) {
  content = content.replace('import { useState } from "react";', 'import { useState, useEffect } from "react";');
}

// Add DriveInfo interface if not present
if (!content.includes('interface DriveInfo')) {
  content = content.replace("export function ImportSourceStep() {", `
interface DriveInfo {
  name: string;
  path: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

export function ImportSourceStep() {`);
}

// Add state and effect for drives
if (!content.includes('const [drives, setDrives]')) {
  content = content.replace('const [isTemplateLocked, setIsTemplateLocked] = useState(true);', `
  const [isTemplateLocked, setIsTemplateLocked] = useState(true);
  const [drives, setDrives] = useState<DriveInfo[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchDrives = async () => {
      try {
        const detectedDrives = await invoke<DriveInfo[]>('get_removable_drives');
        if (isMounted) {
          setDrives(detectedDrives);
        }
      } catch (error) {
        console.error("Failed to get drives:", error);
      }
    };
    
    fetchDrives();
    const interval = setInterval(fetchDrives, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);
`);
}

// Replace the fallback UI
const oldFallback = `        ) : (
          <div className="bg-app-card/30 border border-dashed border-app-border rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-80">
            <div className="w-12 h-12 rounded-full bg-app-deepest flex items-center justify-center mb-3 text-txt-tertiary">
              <HardDrive className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-txt-secondary mb-1">No source detected</h3>
            <p className="text-xs text-txt-tertiary max-w-[200px]">Insert an SD card or select a folder below to begin import.</p>
          </div>
        )}`;

const newFallback = `        ) : (
          drives.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {drives.map((drive, idx) => (
                <div 
                  key={idx}
                  onClick={() => {
                    setSourceDirectory(drive.path);
                    setIsScanning(true);
                    invoke('scan_source_directory', { path: drive.path })
                      .then((files: any) => setScannedFiles(files))
                      .catch(e => console.error(e))
                      .finally(() => setIsScanning(false));
                  }}
                  className="bg-app-card border border-app-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent hover:bg-accent/5 transition-all text-center group ring-1 ring-transparent hover:ring-accent/30"
                >
                  <div className="w-10 h-10 rounded-full bg-app-deepest flex items-center justify-center group-hover:scale-110 transition-transform">
                    <HardDrive className="w-5 h-5 text-txt-secondary group-hover:text-accent transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-txt-primary truncate max-w-[140px]" title={drive.name}>{drive.name || 'SD Card'}</h3>
                    <p className="text-[10px] text-txt-tertiary">{(drive.available_space / (1024*1024*1024)).toFixed(1)} GB free</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-app-card/30 border border-dashed border-app-border rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-80">
              <div className="w-12 h-12 rounded-full bg-app-deepest flex items-center justify-center mb-3 text-txt-tertiary">
                <HardDrive className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="font-semibold text-txt-secondary mb-1">Waiting for SD Card...</h3>
              <p className="text-xs text-txt-tertiary max-w-[200px]">Insert an SD card or select a folder below to begin import.</p>
            </div>
          )
        )}`;

content = content.replace(oldFallback, newFallback);
fs.writeFileSync(path, content);
console.log("Updated UI!");
