"use client";

/**
 * A correlation heatmap.
 *
 * Built from HTML table cells rather than a charting library, for three reasons:
 * a correlation matrix is genuinely tabular data and belongs in a <table> for
 * screen readers; the numeric value is printed in every cell so the information
 * is never carried by colour alone; and at this size a library would add weight
 * without adding anything.
 *
 * The colour scale is DIVERGING, centred at zero, because correlation has a
 * meaningful midpoint — the sign matters as much as the magnitude. A sequential
 * ramp would imply that −1 and +1 are at opposite ends of a single quantity,
 * when in fact both represent perfect dependence.
 */
export function CorrelationHeatmap({
  matrix,
  labels,
  caption,
  onChange,
  format = (v) => v.toFixed(2),
}: {
  matrix: number[][];
  labels: string[];
  caption?: string;
  onChange?: (i: number, j: number, value: number) => void;
  format?: (value: number) => string;
}) {
  const cellColor = (value: number) => {
    const magnitude = Math.min(1, Math.abs(value));
    const hue = value >= 0 ? "var(--series-1)" : "var(--series-5)";
    return `color-mix(in oklab, ${hue} ${Math.round(magnitude * 72)}%, var(--surface))`;
  };

  // Text must stay legible against the strongest cell colours.
  const textColor = (value: number) => (Math.abs(value) > 0.55 ? "var(--ink)" : "var(--ink-muted)");

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        {caption ? <caption className="mb-2 text-left text-2xs text-ink-faint">{caption}</caption> : null}
        <thead>
          <tr>
            <th scope="col" className="px-1.5 py-1 text-left text-2xs font-medium text-ink-faint" />
            {labels.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-1.5 py-1 text-center text-2xs font-medium text-ink-faint"
                title={label}
              >
                {label.split(" ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <th
                scope="row"
                className="whitespace-nowrap px-1.5 py-1 text-left text-2xs font-medium text-ink-muted"
                title={labels[i]}
              >
                {labels[i].split(" ")[0]}
              </th>
              {row.map((value, j) => (
                <td key={j} className="p-0.5">
                  <div
                    className="tabular grid h-9 place-items-center rounded text-2xs font-medium"
                    style={{ background: cellColor(value), color: textColor(value) }}
                    title={`${labels[i]} vs ${labels[j]}: ${format(value)}`}
                  >
                    {i === j ? (
                      <span className="text-ink">{format(value)}</span>
                    ) : onChange ? (
                      <input
                        type="number"
                        value={Number(value.toFixed(2))}
                        min={-1}
                        max={1}
                        step={0.05}
                        aria-label={`Correlation between ${labels[i]} and ${labels[j]}`}
                        onChange={(e) => {
                          const parsed = Number(e.target.value);
                          if (!Number.isFinite(parsed)) return;
                          onChange(i, j, Math.max(-1, Math.min(1, parsed)));
                        }}
                        className="tabular h-full w-full cursor-pointer rounded bg-transparent text-center text-2xs font-medium outline-none"
                        style={{ color: textColor(value) }}
                      />
                    ) : (
                      format(value)
                    )}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-2xs text-ink-faint">
        <span>−1</span>
        <span
          aria-hidden="true"
          className="h-2 flex-1 rounded"
          style={{
            background:
              "linear-gradient(to right, color-mix(in oklab, var(--series-5) 72%, var(--surface)), var(--surface), color-mix(in oklab, var(--series-1) 72%, var(--surface)))",
          }}
        />
        <span>+1</span>
      </div>
    </div>
  );
}

/** Horizontal stacked bar showing portfolio weights. */
export function WeightBar({
  weights,
  labels,
  colors,
}: {
  weights: number[];
  labels: string[];
  colors: string[];
}) {
  // Short positions cannot be drawn in a stacked bar that sums to 100%, so we
  // scale by the total ABSOLUTE exposure and mark shorts with a hatch pattern.
  const total = weights.reduce((sum, w) => sum + Math.abs(w), 0) || 1;

  return (
    <div>
      <div
        className="flex h-7 w-full overflow-hidden rounded border border-line"
        role="img"
        aria-label={`Portfolio allocation: ${weights.map((w, i) => `${labels[i]} ${(w * 100).toFixed(1)}%`).join(", ")}`}
      >
        {weights.map((weight, i) => {
          const share = Math.abs(weight) / total;
          if (share < 0.001) return null;
          return (
            <div
              key={i}
              className="grid place-items-center text-2xs font-medium"
              style={{
                width: `${share * 100}%`,
                background: weight < 0 ? "transparent" : colors[i],
                border: weight < 0 ? `1px dashed ${colors[i]}` : undefined,
                color: weight < 0 ? colors[i] : "var(--canvas)",
              }}
              title={`${labels[i]}: ${(weight * 100).toFixed(1)}%`}
            >
              {share > 0.09 ? `${(weight * 100).toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {weights.map((weight, i) => (
          <li key={i} className="flex items-center gap-1.5 text-2xs text-ink-muted">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-sm"
              style={{
                background: weight < 0 ? "transparent" : colors[i],
                border: weight < 0 ? `1px dashed ${colors[i]}` : undefined,
              }}
            />
            {labels[i]}
            <span className="tabular font-medium text-ink">{(weight * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
