const fs = require('fs');

const path = 'src/components/views/import/ImportSourceStep.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add DriveInfo interface
const driveInfoInterface = `
interface DriveInfo {
  name: string;
  path: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}
`;
content = content.replace("import { useImportStore", driveInfoInterface + "\nimport { useImportStore");

// Add useEffect
const useEffectImport = `import { useState, useEffect } from "react";`;
content = content.replace(`import { useState } from "react";`, useEffectImport);

const stateVars = `
  const [isTemplateLocked, setIsTemplateLocked] = useState(true);
  const [drives, setDrives] = useState<DriveInfo[]>([]);

  useEffect(() => {
    const fetchDrives = async () => {
      try {
        const detectedDrives = await invoke<DriveInfo[]>('get_removable_drives');
        setDrives(detectedDrives);
      } catch (error) {
        console.error("Failed to get drives:", error);
      }
    };
    
    fetchDrives();
    const interval = setInterval(fetchDrives, 2000);
    return () => clearInterval(interval);
  }, []);
`;
content = content.replace("const [isTemplateLocked, setIsTemplateLocked] = useState(true);", stateVars);

// Replace UI Dropzone area
const newDropzone = `
        {/* Large drop zone / Card selection */}
        {drives.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-2">
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
                className={\`border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all text-center group \${sourceDirectory === drive.path ? 'border-accent bg-accent/10' : 'border-app-border hover:border-accent hover:bg-accent/5'}\`}
              >
                <div className={\`w-10 h-10 rounded-full flex items-center justify-center transition-transform \${sourceDirectory === drive.path ? 'bg-accent/20 scale-110' : 'bg-app-deepest group-hover:scale-110'}\`}>
                  <HardDrive className={\`w-5 h-5 \${sourceDirectory === drive.path ? 'text-accent' : 'text-txt-secondary group-hover:text-accent'} transition-colors\`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-txt-primary truncate max-w-[140px]" title={drive.name}>{drive.name || 'Untitled Drive'}</h3>
                  <p className="text-[10px] text-txt-tertiary">{(drive.available_space / (1024*1024*1024)).toFixed(1)} GB free</p>
                </div>
              </div>
            ))}
            <div 
              onClick={handleSelectFolder}
              className="border-2 border-dashed border-app-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent hover:bg-accent/5 transition-all text-center group"
            >
              <div className="w-10 h-10 rounded-full bg-app-deepest flex items-center justify-center group-hover:scale-110 transition-transform">
                <FolderSearch className="w-5 h-5 text-txt-secondary group-hover:text-accent transition-colors" />
              </div>
              <h3 className="text-sm font-semibold text-txt-primary">Browse Folder</h3>
            </div>
          </div>
        ) : (
          <div 
            onClick={handleSelectFolder}
            className="border-2 border-dashed border-app-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-accent hover:bg-accent/5 transition-all text-center group"
          >
            <div className="w-12 h-12 rounded-full bg-app-deepest flex items-center justify-center group-hover:scale-110 transition-transform">
              <HardDrive className="w-6 h-6 text-txt-secondary group-hover:text-accent transition-colors" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-txt-primary mb-1">Select Source Folder</h3>
              <p className="text-xs text-txt-tertiary">Insert an SD card or click to browse</p>
            </div>
          </div>
        )}
`;

content = content.replace(/\{\/\* Large drop zone \/ Card selection \*\/\}.*?(?=<div className="flex items-center justify-between text-xs mb-1">)/s, newDropzone);

fs.writeFileSync(path, content);
