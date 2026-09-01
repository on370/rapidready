import { useState } from "react";
import { ImportSourceStep } from "./import/ImportSourceStep";
import { ImportPreviewStep } from "./import/ImportPreviewStep";
import { ImportExecuteStep } from "./import/ImportExecuteStep";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function ImportView() {
  const [currentStep, setCurrentStep] = useState<number>(1);

  const handleNext = () => setCurrentStep((prev) => Math.min(prev + 1, 3));
  const handlePrev = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  return (
    <div id="view-import" className="flex-col flex-1 overflow-hidden flex">
      {/* Step Wizard Indicator */}
      <div className="flex items-center justify-center py-4 px-6 border-b border-app-border bg-app-panel/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Step 1 */}
          <button onClick={() => setCurrentStep(1)} className="step-indicator flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer">
            <div className={`step-num w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${currentStep >= 1 ? 'bg-accent text-app-deepest' : 'bg-app-card border border-app-border text-txt-tertiary'}`}>1</div>
            <span className={`text-sm font-medium ${currentStep >= 1 ? 'text-txt-primary' : 'text-txt-tertiary'}`}>Source</span>
          </button>
          <div className={`w-8 h-px ${currentStep >= 2 ? 'bg-accent/50' : 'bg-app-border'}`}></div>
          {/* Step 2 */}
          <button onClick={() => setCurrentStep(2)} className="step-indicator flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer">
            <div className={`step-num w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${currentStep >= 2 ? 'bg-accent text-app-deepest' : 'bg-app-card border border-app-border text-txt-tertiary'}`}>2</div>
            <span className={`text-sm font-medium ${currentStep >= 2 ? 'text-txt-primary' : 'text-txt-tertiary'}`}>Preview</span>
          </button>
          <div className={`w-8 h-px ${currentStep >= 3 ? 'bg-accent/50' : 'bg-app-border'}`}></div>
          {/* Step 3 */}
          <button onClick={() => setCurrentStep(3)} className="step-indicator flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer">
            <div className={`step-num w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${currentStep === 3 ? 'bg-accent text-app-deepest' : 'bg-app-card border border-app-border text-txt-tertiary'}`}>3</div>
            <span className={`text-sm font-medium ${currentStep === 3 ? 'text-txt-primary' : 'text-txt-tertiary'}`}>Import</span>
          </button>
        </div>
      </div>

      {/* Step Content Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {currentStep === 1 && <ImportSourceStep />}
        {currentStep === 2 && <ImportPreviewStep />}
        {currentStep === 3 && <ImportExecuteStep />}
      </div>

      {/* Step Action Bar */}
      {currentStep < 3 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-app-border bg-app-panel/80 flex-shrink-0" id="step-actions">
          <button 
            className="px-5 py-2 bg-app-card border border-app-border rounded-lg text-sm font-medium text-txt-secondary hover:bg-app-hover hover:border-app-border-hover transition-all duration-150 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed" 
            disabled={currentStep === 1} 
            onClick={handlePrev}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <button 
              className="px-6 py-2 bg-accent hover:bg-accent-hover rounded-lg text-sm font-semibold text-app-deepest transition-all duration-150 flex items-center gap-2 shadow-lg shadow-accent/20" 
              onClick={handleNext}
            >
              <span>{currentStep === 1 ? 'Preview' : 'Start Import'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
