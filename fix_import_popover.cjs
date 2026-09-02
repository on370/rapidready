const fs = require('fs');
let path = 'src/components/views/import/ImportPreviewStep.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add translation import and hooks
content = content.replace(
  'import { useState, useMemo } from "react";',
  'import { useState, useMemo, useRef, useEffect } from "react";\nimport { useTranslation } from "react-i18next";'
);

content = content.replace(
  'export function ImportPreviewStep() {',
  'export function ImportPreviewStep() {\n  const { t } = useTranslation("help");\n  const [isHelpOpen, setIsHelpOpen] = useState(false);\n  const popoverRef = useRef<HTMLDivElement>(null);\n\n  useEffect(() => {\n    const handleClickOutside = (event: MouseEvent) => {\n      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {\n        setIsHelpOpen(false);\n      }\n    };\n    if (isHelpOpen) document.addEventListener("mousedown", handleClickOutside);\n    return () => document.removeEventListener("mousedown", handleClickOutside);\n  }, [isHelpOpen]);'
);

// Replace the old HTML hover block
const oldHtml = `<div className="relative group flex items-center">
              <span className="cursor-help flex items-center">
                <Info className="w-4 h-4 text-txt-secondary" />
              </span>
              <div className="absolute left-0 top-full mt-2 w-48 p-2 bg-app-deepest border border-app-border rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-[10px] text-txt-secondary text-left leading-tight">
                Displays metadata and a preview for the file selected in the tree.
              </div>
            </div>`;

const newHtml = `<div className="relative" ref={popoverRef}>
              <button 
                className={\`p-1.5 rounded-full transition-colors \${isHelpOpen ? 'bg-accent/20 text-accent' : 'text-txt-tertiary hover:text-txt-secondary hover:bg-app-hover'}\`}
                onClick={() => setIsHelpOpen(!isHelpOpen)}
              >
                <Info className="w-4 h-4" />
              </button>
              {isHelpOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 bg-app-card border border-app-border rounded-xl shadow-2xl z-50 overflow-hidden text-left">
                  <div className="px-4 py-3 border-b border-app-border bg-app-panel/50">
                    <h4 className="text-sm font-semibold text-txt-primary">
                      {t('tooltip.inspectorTitle')}
                    </h4>
                  </div>
                  <div className="p-4 text-xs text-txt-secondary leading-relaxed">
                    {t('tooltip.inspector')}
                  </div>
                </div>
              )}
            </div>`;

content = content.replace(oldHtml, newHtml);

fs.writeFileSync(path, content);
console.log('Fixed ImportPreviewStep popover');
