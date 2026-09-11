import React from 'react';
import { Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useImportStore, DATE_FORMAT_OPTIONS } from '../../../../stores/importStore';

export const StructurePatternPicker = React.memo(function StructurePatternPicker() {
  const { t } = useTranslation('import');

  const {
    structureMode,
    setStructureMode,
    dateFormat,
    setDateFormat,
    customPattern,
    setCustomPattern,
    projectName,
    setProjectName,
    destinationDirectory,
    scannedFiles,
  } = useImportStore();

  const newFiles = scannedFiles.filter((f) => !f.already_imported);

  const generatePreview = () => {
    if (!destinationDirectory) {
      return (
        <div className="bg-app-deepest border border-app-border rounded-lg p-3 text-xs text-txt-tertiary italic">
          {t('destination.selectDestination')}
        </div>
      );
    }

    const header = (
      <div className="flex items-center gap-2 text-xs text-txt-tertiary border-b border-app-border/40 pb-2 mb-2 min-w-0">
        <span className="text-[10px] font-bold text-txt-tertiary uppercase tracking-wider flex-shrink-0">{t('source.baseLabel')}</span>
        <span className="font-mono text-txt-secondary truncate" title={destinationDirectory}>{destinationDirectory}/</span>
      </div>
    );

    if (structureMode === 'flat') {
      return (
        <div className="bg-app-deepest border border-app-border rounded-lg p-3">
          {header}
          <div className="flex items-center justify-between text-xs text-txt-tertiary italic font-sans py-0.5">
            <span>{t('destination.modeFlat')}</span>
            <span className="text-txt-tertiary ml-auto text-[11px] not-italic font-mono flex-shrink-0">({newFiles.length} {t('destination.previewFiles')})</span>
          </div>
        </div>
      );
    }

    if (structureMode === 'project') {
      const pName = projectName.trim() || 'Project_Folder';
      return (
        <div className="bg-app-deepest border border-app-border rounded-lg p-3">
          {header}
          <div className="flex items-center gap-2 text-txt-primary font-mono text-xs">
            <Folder className="w-3.5 h-3.5 text-warning/80 flex-shrink-0" />
            <span className="font-semibold text-accent truncate">{pName}/</span>
            <span className="text-txt-tertiary ml-auto text-[11px] font-sans flex-shrink-0">({newFiles.length} {t('destination.previewFiles')})</span>
          </div>
        </div>
      );
    }

    // Date or Custom Token mode
    let datesToUse: Date[] = [];
    if (newFiles.length > 0) {
      const days = new Set<string>();
      for (const f of newFiles) {
        if (f.date) {
          const dStr = f.date.split('T')[0];
          if (!days.has(dStr)) {
            days.add(dStr);
            datesToUse.push(new Date(f.date));
            if (datesToUse.length >= 3) break;
          }
        }
      }
    }
    if (datesToUse.length === 0) datesToUse = [new Date()];

    const pattern = structureMode === 'date' ? dateFormat : customPattern;

    const paths = datesToUse.map((d) => {
      let p = pattern || '';
      p = p.replace(/{year}/g, d.getFullYear().toString());
      p = p.replace(/{month}/g, (d.getMonth() + 1).toString().padStart(2, '0'));
      p = p.replace(/{day}/g, d.getDate().toString().padStart(2, '0'));
      p = p.replace(/{camera}/g, "EOS_R5");
      p = p.replace(/{ext}/g, "RAW");
      return p.replace(/\\/g, '/');
    });

    return (
      <div className="bg-app-deepest border border-app-border rounded-lg p-3 font-mono text-xs">
        {header}
        <div className="space-y-1.5">
          {paths.map((sub, idx) => (
            <div key={idx} className="flex items-center gap-2 text-txt-primary">
              <Folder className="w-3.5 h-3.5 text-warning/80 flex-shrink-0" />
              <span className="font-medium truncate">{sub.endsWith('/') ? sub : sub + '/'}</span>
              <span className="text-txt-tertiary ml-auto text-[10px] opacity-70 font-sans flex-shrink-0">~files</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 3. Folder Structuring Options */}
      <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3.5">
        <label className="block text-xs font-semibold text-txt-primary uppercase tracking-wider">
          {t('destination.structuring')}
        </label>

        {/* Option 1: By Shooting Date */}
        <div className="space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
            <input 
              type="radio" 
              name="structureMode" 
              checked={structureMode === 'date'} 
              onChange={() => setStructureMode('date')}
              className="accent-accent cursor-pointer"
            />
            <span>{t('destination.modeDate')}</span>
          </label>
          {structureMode === 'date' && (
            <div className="ml-6 flex items-center gap-2">
              <select 
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="bg-app-deepest border border-app-border rounded-lg px-3 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent cursor-pointer w-full font-mono"
              >
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label} ({opt.id})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Option 2: Custom Pattern (Tokens) */}
        <div className="space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
            <input 
              type="radio" 
              name="structureMode" 
              checked={structureMode === 'custom'} 
              onChange={() => setStructureMode('custom')}
              className="accent-accent cursor-pointer"
            />
            <span>{t('destination.modeCustom')}</span>
          </label>
          {structureMode === 'custom' && (
            <div className="ml-6 space-y-2">
              <input 
                type="text"
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                placeholder="{year}/{year}-{month}-{day}"
                className="w-full bg-app-deepest border border-app-border rounded-lg px-3 py-1.5 text-xs font-mono text-txt-primary focus:outline-none focus:border-accent"
              />
              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                <span className="text-txt-tertiary mr-1">{t('destination.tokensHint')}</span>
                {['{year}', '{month}', '{day}', '{camera}', '{ext}'].map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setCustomPattern((customPattern ? customPattern + '/' : '') + tok)}
                    className="px-1.5 py-0.5 rounded bg-app-panel border border-app-border text-accent hover:bg-accent/15 transition-colors font-mono cursor-pointer"
                  >
                    +{tok}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Option 3: Fixed Project / Event Folder */}
        <div className="space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
            <input 
              type="radio" 
              name="structureMode" 
              checked={structureMode === 'project'} 
              onChange={() => setStructureMode('project')}
              className="accent-accent cursor-pointer"
            />
            <span>{t('destination.modeProject')}</span>
          </label>
          {structureMode === 'project' && (
            <div className="ml-6">
              <input 
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={t('destination.projectPlaceholder')}
                className="w-full bg-app-deepest border border-app-border rounded-lg px-3 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        {/* Option 4: Flat (No subfolders) */}
        <div className="space-y-1">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-txt-primary">
            <input 
              type="radio" 
              name="structureMode" 
              checked={structureMode === 'flat'} 
              onChange={() => setStructureMode('flat')}
              className="accent-accent cursor-pointer"
            />
            <span>{t('destination.modeFlat')}</span>
          </label>
        </div>
      </div>

      {/* 4. Live Preview */}
      <div>
        <label className="block text-xs font-medium text-txt-tertiary mb-1.5">{t('destination.preview')}</label>
        {generatePreview()}
      </div>
    </div>
  );
});
