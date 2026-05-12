/**
 * Root loading fallback. Next.js renders this automatically as the Suspense
 * boundary for page transitions and during initial server data fetches.
 */
export default function RootLoading() {
  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="flex flex-col items-center gap-4">
        <span className="relative inline-flex h-10 w-10">
          <span className="absolute inset-0 rounded-full border-2 border-fuchsia-400/20" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-fuchsia-400 animate-spin" />
        </span>
        <span className="text-sm text-white/60 font-medium tracking-wide">Loading…</span>
      </div>
    </main>
  );
}
