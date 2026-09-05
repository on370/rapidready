import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImportSourceStep } from "./import/ImportSourceStep";
import { ImportPreviewStep } from "./import/ImportPreviewStep";
import { ImportExecuteStep } from "./import/ImportExecuteStep";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useImportStore } from "../../stores/importStore";

export function ImportView() {
  const { t } = useTranslation('import');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const { scannedFiles, sourceDirectory, destinationDirectory, isScanning } = useImportStore();

  const selectedCount = scannedFiles.filter(f => f.selected).length;

  const canProceed = () => {
    if (isScanning) return false;
    if (currentStep === 1) {
      return (
        sourceDirectory !== null && 
        destinationDirectory !== null && 
        scannedFiles.length > 0
      );
    }
    if (currentStep === 2) return selectedCount > 0;
    return false;
  };

  const handleNext = () => {
    if (isScanning || !canProceed()) return;
    setCurrentStep((prev) => Math.min(prev + 1, 3));
  };

  const handlePrev = () => {
    if (isScanning) return;
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const canGoToStep = (step: number) => {
    if (isScanning) return false;
    if (step <= currentStep) return true;
    if (step === currentStep + 1) return canProceed();
    return false; // cannot skip steps forward
  };

  const handleStepClick = (step: number) => {
    if (canGoToStep(step)) {
      setCurrentStep(step);
    }
  };

  return (
    <div id="view-import" className="flex-col flex-1 overflow-hidden flex">
      {/* Step Wizard Indicator */}
      <div className="flex items-center justify-center py-4 px-6 border-b border-app-border bg-app-panel/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Step 1 */}
          <button onClick={() => handleStepClick(1)} className="step-indicator flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer">
            <div className={`step-num w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${currentStep >= 1 ? 'bg-accent text-app-deepest' : 'bg-app-card border border-app-border text-txt-tertiary'}`}>1</div>
            <span className={`text-sm font-medium ${currentStep >= 1 ? 'text-txt-primary' : 'text-txt-tertiary'}`}>{t('wizard.stepSource')}</span>
          </button>
          <div className={`w-8 h-px ${currentStep >= 2 ? 'bg-accent/50' : 'bg-app-border'}`}></div>
          {/* Step 2 */}
          <button onClick={() => handleStepClick(2)} disabled={!canGoToStep(2)} className="step-indicator flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <div className={`step-num w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${currentStep >= 2 ? 'bg-accent text-app-deepest' : 'bg-app-card border border-app-border text-txt-tertiary'}`}>2</div>
            <span className={`text-sm font-medium ${currentStep >= 2 ? 'text-txt-primary' : 'text-txt-tertiary'}`}>{t('wizard.stepPreview')}</span>
          </button>
          <div className={`w-8 h-px ${currentStep >= 3 ? 'bg-accent/50' : 'bg-app-border'}`}></div>
          {/* Step 3 */}
          <button onClick={() => handleStepClick(3)} disabled={!canGoToStep(3)} className="step-indicator flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <div className={`step-num w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${currentStep === 3 ? 'bg-accent text-app-deepest' : 'bg-app-card border border-app-border text-txt-tertiary'}`}>3</div>
            <span className={`text-sm font-medium ${currentStep === 3 ? 'text-txt-primary' : 'text-txt-tertiary'}`}>{t('wizard.stepImport')}</span>
          </button>
        </div>
      </div>

      {/* Step Content Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {currentStep === 1 && <ImportSourceStep />}
        {currentStep === 2 && <ImportPreviewStep />}
        {currentStep === 3 && <ImportExecuteStep onReset={() => setCurrentStep(1)} />}
      </div>

      {/* Step Action Bar */}
      {currentStep < 3 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-app-border bg-app-panel/80 flex-shrink-0" id="step-actions">
          <button 
            className="px-5 py-2 bg-app-card border border-app-border rounded-lg text-sm font-medium text-txt-secondary hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed" 
            disabled={currentStep === 1 || isScanning} 
            onClick={handlePrev}
          >
            <ArrowLeft className="w-4 h-4" />
            {t('wizard.btnBack')}
          </button>
          <div className="flex items-center gap-3">
            <button 
              className="px-6 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-semibold text-app-deepest transition-all duration-150 flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer" 
              onClick={handleNext}
              disabled={!canProceed() || isScanning}
              title={
                !canProceed() && !isScanning ? (
                  currentStep === 1 ? (
                    !sourceDirectory ? t('wizard.hintSelectSource') :
                    !destinationDirectory ? t('wizard.hintSelectDestination') :
                    scannedFiles.length === 0 ? t('wizard.hintNoFiles') : ''
                  ) : (
                    selectedCount === 0 ? t('wizard.hintSelectFiles') : ''
                  )
                ) : ''
              }
            >
              <span>{currentStep === 1 ? t('wizard.btnPreview') : t('wizard.btnStartImport')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
