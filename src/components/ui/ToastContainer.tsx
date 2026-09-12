import { useToastStore, ToastMessage } from "../../stores/toastStore";
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-6 z-[400] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const getIcon = () => {
    switch (toast.type) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />;
    }
  };

  const getStyle = () => {
    switch (toast.type) {
      case 'error':
        return 'bg-red-950/95 border-red-800/80 text-red-200';
      case 'warning':
        return 'bg-amber-950/95 border-amber-800/80 text-amber-200';
      case 'success':
        return 'bg-emerald-950/95 border-emerald-800/80 text-emerald-200';
      default:
        return 'bg-neutral-900/95 border-neutral-700 text-neutral-200';
    }
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-3 rounded-lg shadow-2xl border backdrop-blur-md transition-all text-xs font-sans ${getStyle()}`}
    >
      {getIcon()}
      <div className="flex-1 min-w-0 pr-1">
        {toast.title && <div className="font-semibold text-txt-primary mb-0.5">{toast.title}</div>}
        <div className="leading-relaxed break-words opacity-90">{toast.message}</div>
      </div>
      <button
        onClick={onClose}
        className="text-txt-tertiary hover:text-txt-primary p-0.5 rounded transition-colors flex-shrink-0 -mr-1 -mt-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
