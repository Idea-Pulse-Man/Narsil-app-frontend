import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Narsil render error:", error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink px-6 text-center text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Something went wrong
        </p>
        <h1 className="mt-3 font-serif text-2xl text-white">
          The gallery paused unexpectedly
        </h1>
        <p className="mt-3 max-w-sm text-sm text-white/55">
          Reload to try again. If this keeps happening, clear site data for this
          app and reopen it.
        </p>
        <button
          type="button"
          onClick={this.reload}
          className="mt-6 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink"
        >
          Reload app
        </button>
      </div>
    );
  }
}
