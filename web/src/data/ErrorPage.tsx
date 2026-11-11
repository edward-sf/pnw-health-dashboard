type Props = { message: string; onRetry: () => void };

export default function ErrorPage({ message, onRetry }: Props) {
  return (
    <div role="alert">
      <h2>Couldn't load the data</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
