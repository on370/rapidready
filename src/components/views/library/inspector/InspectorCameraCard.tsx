import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Camera } from "lucide-react";
import { LibraryImage } from "../../../../stores/libraryStore";
import { 
  formatShutterSpeed, formatAperture, formatIso, formatFocalLength,
  formatExposureBias, formatCameraModel, formatLensModel 
} from "../../../../utils/formatMetadata";

interface InspectorCameraCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function InspectorCameraCard({
  activeImage,
  isCollapsed,
  onToggle,
}: InspectorCameraCardProps) {
  const { t } = useTranslation('library');

  const formattedCamera = useMemo(() => formatCameraModel(activeImage.camera), [activeImage.camera]);
  const formattedLens = useMemo(() => formatLensModel(activeImage.lens), [activeImage.lens]);
  const formattedIso = useMemo(() => formatIso(activeImage.iso), [activeImage.iso]);
  const formattedAperture = useMemo(() => formatAperture(activeImage.aperture), [activeImage.aperture]);
  const formattedShutter = useMemo(() => formatShutterSpeed(activeImage.shutter), [activeImage.shutter]);
  const formattedEv = useMemo(() => formatExposureBias(activeImage.exposure_bias), [activeImage.exposure_bias]);
  const formattedFocalLength = useMemo(() => formatFocalLength(activeImage.focal_length), [activeImage.focal_length]);

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
      <div 
        onClick={onToggle}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          )}
          <Camera className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider group-hover:text-txt-secondary transition-colors">
            {t('inspector.camera')}
          </h3>
        </div>
        {isCollapsed && formattedCamera && (
          <span className="text-[10px] text-txt-tertiary truncate max-w-[140px] font-medium" title={formattedCamera}>
            {formattedCamera}
          </span>
        )}
      </div>

      {!isCollapsed && (
        <div className="space-y-2 text-[11px]">
          <div>
            <span className="text-txt-tertiary block text-[10px]">{t('inspector.body')}</span>
            <p className="text-txt-primary font-medium truncate" title={formattedCamera || '—'}>
              {formattedCamera || '—'}
            </p>
          </div>
          <div>
            <span className="text-txt-tertiary block text-[10px]">{t('inspector.lens')}</span>
            <p className="text-txt-primary font-medium truncate" title={formattedLens || '—'}>
              {formattedLens || '—'}
              {formattedFocalLength && (!formattedLens || !formattedLens.includes(formattedFocalLength)) && (
                <span className="text-txt-tertiary font-mono text-[10px] ml-1.5 font-normal">({formattedFocalLength})</span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-app-border/40">
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.iso')}</span>
              <p className="text-txt-primary font-mono font-medium truncate text-xs" title={formattedIso || undefined}>
                {formattedIso || '—'}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.aperture')}</span>
              <p className="text-txt-primary font-mono font-medium truncate text-xs" title={formattedAperture || undefined}>
                {formattedAperture || '—'}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.shutter')}</span>
              <p className="text-txt-primary font-mono font-medium truncate text-xs" title={formattedShutter || undefined}>
                {formattedShutter || '—'}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-txt-tertiary block text-[10px]">{t('inspector.ev', 'EV')}</span>
              <p className="text-txt-primary font-mono font-medium truncate text-xs" title={formattedEv || undefined}>
                {formattedEv || '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
