import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Camera } from "lucide-react";
import { LibraryImage } from "../../../../stores/libraryStore";
import { 
  formatShutterSpeed, formatAperture, formatIso, formatFocalLength,
  formatExposureBias, formatCameraModel, formatLensModel,
  isEquivFocalLengthDifferent, getExposureProgramCode, formatExposureProgram,
  formatMeteringMode, formatWhiteBalance, formatFlash
} from "../../../../utils/formatMetadata";

interface InspectorCameraCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
  isDetailsOpen: boolean;
  onToggleDetails: () => void;
}

export function InspectorCameraCard({
  activeImage,
  isCollapsed,
  onToggle,
  isDetailsOpen,
  onToggleDetails,
}: InspectorCameraCardProps) {
  const { t } = useTranslation('library');

  const formattedCamera = useMemo(() => formatCameraModel(activeImage.camera), [activeImage.camera]);
  const formattedLens = useMemo(() => formatLensModel(activeImage.lens), [activeImage.lens]);
  const formattedIso = useMemo(() => formatIso(activeImage.iso), [activeImage.iso]);
  const formattedAperture = useMemo(() => formatAperture(activeImage.aperture), [activeImage.aperture]);
  const formattedShutter = useMemo(() => formatShutterSpeed(activeImage.shutter), [activeImage.shutter]);
  const formattedEv = useMemo(() => formatExposureBias(activeImage.exposure_bias), [activeImage.exposure_bias]);
  const formattedFocalLength = useMemo(() => formatFocalLength(activeImage.focal_length), [activeImage.focal_length]);
  const formattedFocalLength35mm = useMemo(() => formatFocalLength(activeImage.focal_length_35mm), [activeImage.focal_length_35mm]);

  const hasDifferentEquiv = useMemo(() => {
    return isEquivFocalLengthDifferent(activeImage.focal_length, activeImage.focal_length_35mm);
  }, [activeImage.focal_length, activeImage.focal_length_35mm]);

  const hasExtendedDetails = useMemo(() => {
    return !!(
      activeImage.exposure_program ||
      activeImage.metering_mode ||
      activeImage.white_balance ||
      activeImage.flash ||
      activeImage.color_space ||
      activeImage.subject_distance ||
      activeImage.digital_zoom ||
      activeImage.software ||
      activeImage.body_serial ||
      activeImage.lens_serial
    );
  }, [
    activeImage.exposure_program,
    activeImage.metering_mode,
    activeImage.white_balance,
    activeImage.flash,
    activeImage.color_space,
    activeImage.subject_distance,
    activeImage.digital_zoom,
    activeImage.software,
    activeImage.body_serial,
    activeImage.lens_serial,
  ]);

  const summaryBadge = useMemo(() => {
    const parts: string[] = [];
    const progCode = getExposureProgramCode(activeImage.exposure_program);
    if (progCode) parts.push(progCode);
    if (activeImage.color_space) parts.push(activeImage.color_space);
    return parts.join(' · ');
  }, [activeImage.exposure_program, activeImage.color_space]);

  const formattedProgram = useMemo(() => {
    return formatExposureProgram(activeImage.exposure_program, t);
  }, [activeImage.exposure_program, t]);

  const formattedMetering = useMemo(() => {
    return formatMeteringMode(activeImage.metering_mode, t);
  }, [activeImage.metering_mode, t]);

  const formattedWb = useMemo(() => {
    return formatWhiteBalance(activeImage.white_balance, t);
  }, [activeImage.white_balance, t]);

  const formattedFlash = useMemo(() => {
    return formatFlash(activeImage.flash, t);
  }, [activeImage.flash, t]);

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
                <span className="text-txt-tertiary font-mono text-[10px] ml-1.5 font-normal">
                  {hasDifferentEquiv && formattedFocalLength35mm ? (
                    `(${formattedFocalLength} · ${formattedFocalLength35mm} ${t('inspector.kbEquiv', 'KB')})`
                  ) : (
                    `(${formattedFocalLength})`
                  )}
                </span>
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

          {/* Collapsible Extended Details Drawer */}
          {hasExtendedDetails && (
            <div className="pt-1.5 border-t border-app-border/30">
              <div 
                onClick={onToggleDetails}
                className="flex items-center justify-between cursor-pointer select-none py-0.5 group/details"
              >
                <div className="flex items-center gap-1 min-w-0">
                  {isDetailsOpen ? (
                    <ChevronDown className="w-3 h-3 text-txt-tertiary group-hover/details:text-txt-secondary transition-colors flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-txt-tertiary group-hover/details:text-txt-secondary transition-colors flex-shrink-0" />
                  )}
                  <span className="text-[10px] font-medium text-txt-tertiary group-hover/details:text-txt-secondary transition-colors">
                    {t('inspector.extendedDetails', 'Erweiterte Details')}
                  </span>
                </div>
                {!isDetailsOpen && summaryBadge && (
                  <span className="text-[10px] font-mono text-txt-tertiary truncate max-w-[140px]">
                    {summaryBadge}
                  </span>
                )}
              </div>

              {isDetailsOpen && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-app-border/30 text-[11px]">
                  {/* Programm */}
                  {formattedProgram && (
                    <div className="min-w-0">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.exposureProgram', 'Programm')}</span>
                      <p className="text-txt-primary font-medium truncate" title={formattedProgram.base}>
                        {formattedProgram.base}
                        {formattedProgram.isBracket && (
                          <span className="ml-1 text-[10px] font-mono text-amber-300/90 font-normal">
                            · {t('inspector.bracketBadge', 'BKT')}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Messmethode */}
                  {formattedMetering && (
                    <div className="min-w-0">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.meteringMode', 'Messung')}</span>
                      <p className="text-txt-primary font-medium truncate" title={formattedMetering}>
                        {formattedMetering}
                      </p>
                    </div>
                  )}

                  {/* Weißabgleich */}
                  {formattedWb && (
                    <div className="min-w-0">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.whiteBalance', 'Weißabgleich')}</span>
                      <p className="text-txt-primary font-medium truncate" title={formattedWb}>
                        {formattedWb}
                      </p>
                    </div>
                  )}

                  {/* Blitz */}
                  {formattedFlash && (
                    <div className="min-w-0">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.flash', 'Blitz')}</span>
                      <p className="text-txt-primary font-medium truncate" title={formattedFlash}>
                        {formattedFlash}
                      </p>
                    </div>
                  )}

                  {/* Farbraum */}
                  {activeImage.color_space && (
                    <div className="min-w-0">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.colorSpace', 'Farbraum')}</span>
                      <p className="text-txt-primary font-medium truncate font-mono text-[10.5px]">
                        {activeImage.color_space}
                      </p>
                    </div>
                  )}

                  {/* Fokusdistanz */}
                  {activeImage.subject_distance && (
                    <div className="min-w-0">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.subjectDistance', 'Fokusdistanz')}</span>
                      <p className="text-txt-primary font-medium truncate font-mono text-[10.5px]">
                        {activeImage.subject_distance}
                      </p>
                    </div>
                  )}

                  {/* Digitalzoom */}
                  {activeImage.digital_zoom && (
                    <div className="min-w-0">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.digitalZoom', 'Digitalzoom')}</span>
                      <p className="text-txt-primary font-medium truncate font-mono text-[10.5px]">
                        {activeImage.digital_zoom}
                      </p>
                    </div>
                  )}

                  {/* Seriennummer(n) */}
                  {(activeImage.body_serial || activeImage.lens_serial) && (
                    <div className="min-w-0 col-span-2">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.serialNumber', 'Seriennummer')}</span>
                      <p className="text-txt-secondary font-mono text-[10px] truncate" title={[
                        activeImage.body_serial ? `Body: ${activeImage.body_serial}` : null,
                        activeImage.lens_serial ? `Lens: ${activeImage.lens_serial}` : null,
                      ].filter(Boolean).join(' · ')}>
                        {[
                          activeImage.body_serial ? `Body: ${activeImage.body_serial}` : null,
                          activeImage.lens_serial ? `Lens: ${activeImage.lens_serial}` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  )}

                  {/* Software / Firmware */}
                  {activeImage.software && (
                    <div className="min-w-0 col-span-2">
                      <span className="text-txt-tertiary block text-[10px]">{t('inspector.software', 'Software / Firmware')}</span>
                      <p className="text-txt-secondary font-mono text-[10px] truncate" title={activeImage.software}>
                        {activeImage.software}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
