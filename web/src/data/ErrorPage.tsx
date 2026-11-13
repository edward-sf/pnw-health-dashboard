import { focusPageHeadingWhenReady } from "../hooks/focusPageHeading";

type Props = {
  message: string;
  onRetry: () => void;
  /**
   * The heading is the page's route-focus target (`data-page-heading`), for a route whose only
   * heading is this one. Methodology shows the error under its own page heading, so it leaves
   * this off.
   */
  pageHeading?: boolean;
};

/**
 * Only the message is a live region. Route focus and "Try again" move focus to the heading,
 * which announces it; with the heading inside `role="alert"` too, screen readers could read
 * the error twice.
 */
export default function ErrorPage({ message, onRetry, pageHeading = false }: Props) {
  return (
    <div>
      <h2 {...(pageHeading ? { "data-page-heading": "", tabIndex: -1 } : {})}>
        Couldn't load the data
      </h2>
      <p role="alert">{message}</p>
      <button
        type="button"
        onClick={(e) => {
          const button = e.currentTarget;
          onRetry();
          // The retry replaces this button with the loading state, which would leave keyboard
          // focus on <body>. Once that render has committed, focus the page heading: the
          // loaded page's, the error's if it fails again, or Methodology's straight away.
          queueMicrotask(() => focusPageHeadingWhenReady(button));
        }}
      >
        Try again
      </button>
    </div>
  );
}
