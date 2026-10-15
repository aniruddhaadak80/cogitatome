/**
 * A run of tokens with, under each one, whether the model correctly predicted
 * what came next. Rendered as real SVG so it survives copy-paste and a11y
 * checking, and so the numbers are inspectable in the DOM.
 */
export function TokenStrip({
  tokens,
  predicted,
  continued,
  vocabSize
}: {
  tokens: readonly number[];
  predicted: readonly number[];
  continued: readonly boolean[];
  vocabSize: number;
}) {
  const width = Math.max(320, tokens.length * 34);
  return (
    <svg
      viewBox={`0 0 ${width} 96`}
      width="100%"
      height={96}
      role="img"
      aria-label={`Token run of ${tokens.length} tokens; the model continued ${continued.filter(Boolean).length} correctly`}
      className="overflow-visible"
    >
      <title>{`${tokens.length} tokens, vocab ${vocabSize}`}</title>
      {tokens.map((t, i) => {
        const ok = continued[i] ?? false;
        return (
          <g key={`${t}-${i}`} transform={`translate(${i * 34 + 6}, 8)`}>
            <rect
              width={26}
              height={26}
              rx={4}
              fill={ok ? "rgba(94,241,255,0.16)" : "rgba(255,107,138,0.14)"}
              stroke={ok ? "#5ef1ff" : "#ff6b8a"}
              strokeOpacity={0.5}
            />
            <text
              x={13}
              y={18}
              textAnchor="middle"
              fontSize={12}
              fontFamily="var(--font-mono)"
              fill="#f4f6fb"
            >
              {t}
            </text>
            <text x={13} y={44} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="#8b93b0">
              {predicted[i] ?? "?"}
            </text>
            <line
              x1={4}
              y1={54}
              x2={22}
              y2={54}
              stroke={ok ? "#5ef1ff" : "#ff6b8a"}
              strokeWidth={2}
              opacity={0.7}
            />
          </g>
        );
      })}
    </svg>
  );
}
