import { Component, createRef, type ErrorInfo, type ReactNode } from "react";

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

  private heading = createRef<HTMLHeadingElement>();

  componentDidMount(): void {
    // A child that throws on the very first render mounts the boundary already failed.
    if (this.state.failed) this.heading.current?.focus();
  }

  componentDidUpdate(_prevProps: Props, prevState: State): void {
    // Focus the heading only on the switch into the failed state, so keyboard and screen-reader
    // users are told the page was replaced. The route hasn't changed, so route focus doesn't run.
    if (this.state.failed && !prevState.failed) this.heading.current?.focus();
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const reload = this.props.onReload ?? (() => window.location.reload());
    // Only the message is a live region: the heading takes focus, which announces it, so inside
    // `role="alert"` too it could be read twice (as in ErrorPage).
    return (
      <div>
        <h2 ref={this.heading} data-page-heading="" tabIndex={-1}>
          Something went wrong
        </h2>
        <p role="alert">This page couldn't be shown. Reloading the page usually fixes it.</p>
        <button type="button" onClick={reload}>
          Reload the page
        </button>
      </div>
    );
  }
}
