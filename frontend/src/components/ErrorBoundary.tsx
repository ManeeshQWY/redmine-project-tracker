import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When this changes the boundary tries again — e.g. the tab or project was switched. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Keeps a failure on one screen from blanking the whole app: shows what went wrong and lets the
 * user switch tab, or try again. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("A screen failed to render:", error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
        <p className="font-semibold">This screen hit a problem and could not be shown.</p>
        <p className="mt-1 text-xs opacity-80">{this.state.error.message}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-transparent dark:text-rose-300"
        >
          Try again
        </button>
        <span className="ml-3 text-xs opacity-80">Other tabs are unaffected.</span>
      </div>
    );
  }
}
