import { Component, type ErrorInfo, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback. A function receives the error and a reset callback. */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Clears the error whenever this value changes — handy for route changes. */
  resetKey?: string | number;
  className?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors from anything below it.
 *
 * Charts and visualisations are the usual suspects: one malformed tensor should
 * take out its own panel, not the page. `resetKey` lets a route change clear
 * the boundary without a reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const { fallback, className } = this.props;

    if (typeof fallback === "function") {
      return fallback(error, this.reset);
    }

    if (fallback !== undefined) {
      return fallback;
    }

    return (
      <div
        role="alert"
        className={cn("pane flex flex-col gap-2 border-l-2 border-l-rose p-4", className)}
      >
        <p className="mono-label m-0 text-rose">Something broke</p>
        <p className="m-0 font-display text-base font-semibold text-ink">This panel failed to render.</p>
        <p className="m-0 font-mono text-xs break-words text-ink-dim">{error.message}</p>
        <div>
          <Button size="sm" variant="secondary" onClick={this.reset}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
}
