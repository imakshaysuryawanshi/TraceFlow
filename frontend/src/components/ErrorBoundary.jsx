import { Component } from "react";

/**
 * Catches render errors in the tree below it and shows a friendly fallback
 * instead of unmounting the whole app (blank screen). Wrap the root <App/>
 * with this in index.js.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("TraceFlow crashed:", error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen w-screen bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))] p-6">
          <div className="max-w-md w-full rounded-lg border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel))] p-6 shadow-xl">
            <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--tf-text-muted))] mb-2">
              TraceFlow
            </div>
            <h1 className="text-lg font-semibold mb-1">
              Something went wrong
            </h1>
            <p className="text-[13px] leading-relaxed text-[hsl(var(--tf-text-muted))] mb-4">
              The app hit an unexpected error. Your code and settings are
              saved locally — reload to pick up where you left off.
            </p>
            <p className="mono text-[11.5px] text-[hsl(var(--tf-danger))] bg-[hsl(var(--tf-bg))] rounded p-2.5 mb-4 break-words max-h-24 overflow-y-auto">
              {this.state.message}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="px-3 h-8 rounded-md text-[12.5px] font-medium bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] border border-[hsl(var(--tf-accent))]/40 hover:bg-[hsl(var(--tf-accent))]/15 transition-colors"
              >
                Reload
              </button>
              <button
                onClick={this.handleReset}
                className="px-3 h-8 rounded-md text-[12.5px] border border-[hsl(var(--tf-border-strong))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
