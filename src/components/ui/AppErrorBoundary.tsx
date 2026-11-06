import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useLibraryUIStore } from '../../stores/libraryUIStore';
import { useLibraryStore } from '../../stores/libraryStore';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleRecover = () => {
    try {
      useLibraryUIStore.getState().setViewMode('grid');
      useLibraryStore.getState().clearSelection();
    } catch (e) {
      console.warn('Failed to reset stores during recovery:', e);
    }
    this.setState({ error: null, errorInfo: null });
  };

  public render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[99999] bg-[#0c0d0e] flex items-center justify-center p-6 text-txt-primary select-text">
          <div className="max-w-xl w-full bg-[#18181b] border-2 border-danger/40 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger/15 border border-danger/30 flex items-center justify-center text-danger flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-red-400">
                  {this.props.fallbackTitle || 'Ein unerwarteter Anzeigefehler ist aufgetreten'}
                </h2>
                <p className="text-xs text-txt-tertiary">
                  Die Benutzeroberfläche wurde vor einem Absturz geschützt.
                </p>
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-xl p-3 text-xs font-mono text-red-300 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
              {this.state.error.message || String(this.state.error)}
              {this.state.error.stack && (
                <div className="mt-2 text-[10px] text-txt-tertiary">
                  {this.state.error.stack}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleRecover}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-accent hover:bg-accent/90 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Oberfläche wiederherstellen
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
