// ---------------------------------------------------------------------------
// VIGÍA ML · barrera de errores de React
// Un fallo de render en un panel no debe dejar la consola en blanco: se
// degrada a un panel de contingencia con el resumen del error y un botón
// de recuperación que remonta el árbol completo.
// ---------------------------------------------------------------------------
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // trazabilidad en consola para diagnóstico remoto del fallo de UI
    console.error("[VIGÍA] fallo de render capturado:", error, info.componentStack);
  }

  private recover = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a1216]">
        <div className="panel corners max-w-lg w-full p-6 text-center">
          <div className="font-mono text-[10px] tracking-[0.14em] text-watch mb-2">
            CONTINGENCIA · FALLO DE INTERFAZ
          </div>
          <h1 className="font-display font-bold text-2xl text-fg mb-3">
            El panel no pudo renderizarse
          </h1>
          <p className="text-sm text-fg2 mb-1">
            Los datos siguen intactos. Puedes reintentar la recuperación sin perder la sesión.
          </p>
          <pre className="text-left font-mono text-[10px] text-fg3 bg-black/40 border border-line rounded p-3 max-h-40 overflow-auto mb-4 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.recover}
              className="px-4 py-2 rounded border border-ok/60 text-ok font-mono text-xs tracking-wider hover:bg-ok/10 transition-colors"
            >
              REINTENTAR
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded border border-line text-fg2 font-mono text-xs tracking-wider hover:bg-white/5 transition-colors"
            >
              RECARGAR CONSOLA
            </button>
          </div>
        </div>
      </div>
    );
  }
}
