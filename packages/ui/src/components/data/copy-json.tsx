import { useMemo } from "react";
import { palette, formatNumber } from "../../lib/palette";
import { CodeBlock } from "./code-block";

export interface CopyJsonProps {
  data: unknown;
  /** Header title. Defaults to "json". */
  title?: string;
  indent?: number;
  maxHeight?: string | number;
  /** Accessible name for the scroll region. */
  label?: string;
  /** Show the byte/line size in the footer. */
  showSize?: boolean;
  className?: string;
}

/** Pretty-printed JSON with a copy button and a size readout. */
export function CopyJson({
  data,
  title = "json",
  indent = 2,
  maxHeight = 320,
  label = "JSON payload",
  showSize = true,
  className
}: CopyJsonProps) {
  const { code, size } = useMemo(() => {
    let serialized: string;
    try {
      serialized = JSON.stringify(data, null, indent) ?? "null";
    } catch {
      serialized = "// value could not be serialised";
    }
    return { code: serialized, size: new TextEncoder().encode(serialized).length };
  }, [data, indent]);

  const lineCount = code.split("\n").length;

  return (
    <CodeBlock
      code={code}
      language={title}
      label={label}
      maxHeight={maxHeight}
      className={className}
      footer={
        showSize ? (
          <span className="flex items-center justify-between gap-3">
            <span className="mono-label">
              {lineCount} lines · {formatNumber(size / 1024, 2)} kb
            </span>
            <span className="mono-label">deterministic</span>
          </span>
        ) : undefined
      }
    />
  );
}

/** Re-exported so callers can colour JSON values consistently with the palette. */
export const JSON_ACCENT = palette.cyan;
