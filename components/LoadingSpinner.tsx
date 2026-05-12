export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-white/70">
      <span className="relative inline-flex h-5 w-5">
        <span className="absolute inset-0 rounded-full border-2 border-fuchsia-400/30" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-fuchsia-400 animate-spin" />
      </span>
      <span className="text-sm font-medium">Tailoring your resume…</span>
    </div>
  );
}
