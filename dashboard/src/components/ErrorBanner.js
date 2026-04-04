export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;

  return (
    <div className="border-2 border-black rounded-xl p-4 bg-accent2/10 flex items-center justify-between">
      <div>
        <div className="text-sm font-bold">Something went wrong</div>
        <div className="text-sm text-gray-600 mt-1">{message}</div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="border-2 border-black rounded-lg px-4 py-2 text-sm font-bold hover:bg-accent2/20 transition-colors shrink-0 ml-4"
        >
          Retry
        </button>
      )}
    </div>
  );
}
