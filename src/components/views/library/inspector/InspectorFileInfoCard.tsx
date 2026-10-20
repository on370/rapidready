import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LibraryImage } from "../../../../stores/libraryStore";
import { formatDimensions, formatDisplayDate, areDatesDifferent } from "../../../../utils/formatMetadata";

interface InspectorFileInfoCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
  extension: string;
  isRaw: boolean;
}

export function InspectorFileInfoCard({
  activeImage,
  isCollapsed,
  onToggle,
  extension,
  isRaw,
}: InspectorFileInfoCardProps) {
  const { t } = useTranslation('library');

  const dimensionsInfo = useMemo(() => {
    return formatDimensions(activeImage.width, activeImage.height, activeImage.culling?.orientation);
  }, [activeImage.width, activeImage.height, activeImage.culling?.orientation]);

  const formattedCaptureDate = useMemo(() => formatDisplayDate(activeImage.date), [activeImage.date]);
  const captureDateTitle = useMemo(() => {
    if (!formattedCaptureDate) return '—';
    if (activeImage.subsec_time) {
      return `${formattedCaptureDate}.${activeImage.subsec_time}`;
    }
    return formattedCaptureDate;
  }, [formattedCaptureDate, activeImage.subsec_time]);
  const formattedModifiedDate = useMemo(() => formatDisplayDate(activeImage.date_modified), [activeImage.date_modified]);
  const hasDifferentModifiedDate = useMemo(() => {
    return areDatesDifferent(activeImage.date, activeImage.date_modified);
  }, [activeImage.date, activeImage.date_modified]);

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2">
      <div 
        onClick={onToggle}
        className={`flex items-center justify-between cursor-pointer select-none group ${!isCollapsed ? 'border-b border-app-border/50 pb-1.5' : ''}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-txt-primary truncate mr-2" title={activeImage.name}>{activeImage.name}</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium flex-shrink-0 ${isRaw ? 'bg-accent/15 text-accent' : 'bg-app-panel text-txt-secondary'}`}>
          {extension}
        </span>
      </div>
      
      {!isCollapsed && (
        <>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.dimensions', 'Dimensionen')}</span>
              <p className="text-txt-primary font-medium truncate" title={dimensionsInfo?.fullSummary || '—'}>
                {dimensionsInfo ? (
                  <>
                    {dimensionsInfo.dimensions}{' '}
                    <span className="text-txt-tertiary font-normal text-[10px]">· {dimensionsInfo.megapixels}</span>
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.size')}</span>
              <p className="text-txt-primary font-medium">{(activeImage.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <div className={hasDifferentModifiedDate ? "min-w-0" : "min-w-0 col-span-2"}>
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.dateCaptured', 'Aufnahme')}</span>
              <p className="text-txt-primary font-medium truncate" title={captureDateTitle}>
                {formattedCaptureDate || '—'}
              </p>
            </div>
            {hasDifferentModifiedDate && (
              <div className="min-w-0">
                <span className="text-txt-tertiary block text-[10px]">{t('inspector.dateModified', 'Geändert')}</span>
                <p className="text-txt-primary font-medium truncate text-amber-300/90" title={formattedModifiedDate || '—'}>
                  {formattedModifiedDate || '—'}
                </p>
              </div>
            )}
          </div>
          <div className="pt-1 border-t border-app-border/40">
            <span className="text-txt-tertiary block text-[10px]">{t('inspector.path')}</span>
            <p className="text-txt-secondary font-mono text-[10px] truncate" title={activeImage.path}>
              {activeImage.path}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
