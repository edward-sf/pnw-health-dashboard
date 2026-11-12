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

export default function ErrorPage({ message, onRetry, pageHeading = false }: Props) {
  return (
    <div role="alert">
      <h2 {...(pageHeading ? { "data-page-heading": "", tabIndex: -1 } : {})}>
        Couldn't load the data
      </h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
