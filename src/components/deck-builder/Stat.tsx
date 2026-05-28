export function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 ring-1 ${
        warn
          ? "bg-rose-950/40 ring-rose-800/50"
          : "bg-stone-900/50 ring-stone-800/80"
      }`}
    >
      <p className="text-[0.65rem] uppercase tracking-wider text-stone-500">
        {label}
      </p>
      <p
        className={`text-xl font-bold tabular-nums ${
          warn ? "text-rose-200" : "text-amber-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
