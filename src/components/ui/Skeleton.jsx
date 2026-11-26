export function Skeleton({ className = "", width, height, style = {} }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer block rounded-lg ${className}`}
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonText({ lines = 3, className = "", lineHeight = "0.75rem" }) {
  const quantidade = Math.max(1, Math.floor(Number(lines) || 1));

  return (
    <div aria-hidden="true" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: quantidade }, (_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          className={index === quantidade - 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "", lines = 2 }) {
  return (
    <div
      aria-hidden="true"
      className={`theme-surface rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <Skeleton className="h-8 w-14 rounded-lg" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className = "" }) {
  const quantidadeLinhas = Math.max(1, Math.floor(Number(rows) || 1));
  const quantidadeColunas = Math.max(1, Math.floor(Number(columns) || 1));

  return (
    <div
      aria-hidden="true"
      className={`grid gap-2 ${className}`}
      style={{ gridTemplateColumns: `repeat(${quantidadeColunas}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: quantidadeLinhas * quantidadeColunas }, (_, index) => (
        <Skeleton key={index} className="h-9 rounded-md" />
      ))}
    </div>
  );
}

export function SkeletonCalendar({ days = 42, className = "" }) {
  const quantidade = Math.max(7, Math.floor(Number(days) || 42));
  return (
    <div
      aria-hidden="true"
      className={`grid grid-cols-7 overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      {Array.from({ length: quantidade }, (_, index) => (
        <div key={index} className="min-h-12 border-b border-r border-slate-100 p-1.5 sm:min-h-20 sm:p-2">
          <Skeleton className="h-3 w-5 rounded-sm" />
          {index % 3 === 0 && <Skeleton className="mt-3 h-2.5 w-full rounded-sm" />}
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({ children, className = "", label = "Carregando conteúdo" }) {
  return (
    <div aria-busy="true" className={className}>
      <span role="status" className="sr-only">{label}</span>
      {children}
    </div>
  );
}
