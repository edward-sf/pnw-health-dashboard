import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Called by the reload button; the browser reload outside tests. */
  onReload?: () => void;
};

type State = { failed: boolean };

/**
 * Catches an unexpected render error in a page so the rest of the app stays up. App keys it by
 * pathname, so moving to another page clears the error.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const reload = this.props.onReload ?? (() => window.location.reload());
    return (
      <div role="alert">
        <h2 data-page-heading="" tabIndex={-1}>
          Something went wrong
        </h2>
        <p>This page couldn't be shown. Reloading the page usually fixes it.</p>
        <button type="button" onClick={reload}>
          Reload the page
        </button>
      </div>
    );
  }
}
