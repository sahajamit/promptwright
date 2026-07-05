export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-bg">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-border border-t-lseg-blue mb-4"></div>
        <p className="text-text-muted">Loading Promptwright...</p>
      </div>
    </div>
  );
}
