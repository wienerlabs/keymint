export function SkeletonLine({ width = "100%", height = "16px", className = "" }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonStatBox() {
  return (
    <div className="border-2 border-black rounded-xl p-6 bg-white">
      <div className="flex items-center gap-3 mb-3">
        <div className="skeleton w-3 h-3 rounded-full" />
        <SkeletonLine width="80px" height="12px" />
      </div>
      <SkeletonLine width="120px" height="32px" />
    </div>
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="border-2 border-black rounded-xl p-6 bg-white">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === 0 ? "60%" : i === lines - 1 ? "40%" : "80%"}
          height="14px"
          className={i > 0 ? "mt-3" : ""}
        />
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="border-2 border-black rounded-xl p-6 bg-white">
      <SkeletonLine width="140px" height="20px" className="mb-4" />
      <div className="flex items-end gap-3 h-48">
        {[60, 80, 45, 90, 70, 55].map((h, i) => (
          <div
            key={i}
            className="skeleton flex-1 rounded-t-md"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 4 }) {
  return (
    <div className="border-2 border-black rounded-xl p-6 bg-white">
      <SkeletonLine width="100px" height="20px" className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <SkeletonLine width="40%" height="14px" />
            <SkeletonLine width="20%" height="14px" />
          </div>
        ))}
      </div>
    </div>
  );
}
