const COLOR_MS: Record<string, string> = {
  W: "ms-w",
  U: "ms-u",
  B: "ms-b",
  R: "ms-r",
  G: "ms-g",
};

export function ManaIdentityBadge({
  colors,
  label,
}: {
  colors: string[];
  label?: string;
}) {
  if (!colors.length) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-stone-700/60 bg-stone-900/60 px-2 py-0.5 text-xs text-stone-400">
        <i className="ms ms-c ms-cost text-sm" title="Colorless" />
        {label && <span>{label}</span>}
      </span>
    );
  }

  const sorted = [...colors].sort(
    (a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b),
  );

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-700/60 bg-stone-900/60 px-2.5 py-1">
      {label && (
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-stone-500">
          {label}
        </span>
      )}
      <span className="flex items-center gap-0.5">
        {sorted.map((c) => (
          <i
            key={c}
            className={`ms ${COLOR_MS[c] ?? "ms-c"} ms-cost ms-shadow text-base`}
            title={c}
          />
        ))}
      </span>
    </span>
  );
}
