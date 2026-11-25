export function LoadingScreen({ label = "LOADING ARCADE CABINET..." }: { label?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 p-6 text-center">
      <img
        src="/assets/birds/golden-bird-preview.png"
        alt="Loading SKYHOP"
        className="w-20 h-16 pixel-art animate-bounce"
      />
      <p className="font-arcade-title text-xs sm:text-sm text-[#f5b935] tracking-wider">{label}</p>
      <div className="w-56 h-4 pixel-panel-inset overflow-hidden p-0.5">
        <div className="h-full w-2/3 bg-[#3ac463] animate-pulse" />
      </div>
    </div>
  );
}
