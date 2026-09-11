import { FolderOutput } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useImportStore } from '../../../stores/importStore';
import { SourceDrivePicker } from './components/SourceDrivePicker';
import { ImportProfileHeader } from './components/ImportProfileHeader';
import { DestinationSelector } from './components/DestinationSelector';
import { StructurePatternPicker } from './components/StructurePatternPicker';

export function ImportSourceStep() {
  const { t } = useTranslation('import');
  const isScanning = useImportStore((s) => s.isScanning);

  return (
    <div className="flex-1 overflow-hidden p-6 flex gap-6">
      {/* Left Panel: Source Selection */}
      <SourceDrivePicker />

      {/* Right Panel: Destination & Settings */}
      <fieldset 
        disabled={isScanning} 
        className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-y-auto pl-1 border-0 m-0 p-0 disabled:opacity-40 disabled:pointer-events-none transition-opacity"
      >
        <div className="flex items-center gap-2 mb-1">
          <FolderOutput className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary uppercase tracking-wider">
            {t('destination.title')}
          </h2>
        </div>

        {/* 1. Import Profile Selector */}
        <ImportProfileHeader />

        {/* 2. Unified Destination Selector (In-Place Locations) */}
        <DestinationSelector />

        {/* 3. Folder Structuring Options & Live Preview */}
        <StructurePatternPicker />
      </fieldset>
    </div>
  );
}
