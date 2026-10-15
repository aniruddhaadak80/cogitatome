import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CopyButton } from "../primitives/copy-button";
import { ScrollArea } from "../primitives/scroll-area";

export interface CodeBlockProps {
  code: string;
  /** Shown in the header, e.g. `ts`, `json`, `python`. */
  language?: string;
  showLineNumbers?: boolean;
  maxHeight?: string | number;
  /** Render a copy button in the header. Defaults to true. */
  copy?: boolean;
  /** 1-based line numbers to tint. */
  highlightLines?: readonly number[];
  /** Accessible name for the scrollable region. */
  label?: string;
  /** Extra content below the code. */
  footer?: ReactNode;
  className?: string;
}

/**
 * A read-only code pane.
 *
 * No syntax highlighting dependency: line numbers, per-line tinting and a copy
 * button are enough for a config dump, and the whole block stays selectable.
 */
export function CodeBlock({
  code,
  language = "text",
  showLineNumbers = false,
  maxHeight,
  copy = true,
  highlightLines,
  label = "Code",
  footer,
  className
}: CodeBlockProps) {
  const lines = code.replace(/\n$/, "").split("\n");
  const highlighted = new Set(highlightLines ?? []);

  return (
    <figure className={cn("pane m-0 overflow-hidden", className)}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="mono-label">{language}</span>
        {copy ? <CopyButton value={code} label="Copy code" size="sm" variant="ghost" announce={false} /> : null}
      </figcaption>

      <ScrollArea
        label={label}
        maxHeight={maxHeight}
        className="bg-surface"
        orientation={showLineNumbers ? "both" : "horizontal"}
      >
        <pre className="m-0 p-3 font-mono text-xs leading-relaxed text-ink">
          <code>
            {lines.map((line, index) => (
              <span
                key={`${index}-${line.slice(0, 8)}`}
                className={cn(
                  "block w-full whitespace-pre",
                  highlighted.has(index + 1) && "bg-cyan/10"
                )}
              >
                {showLineNumbers ? (
                  <span className="grid grid-cols-[2.5rem_1fr]">
                    <span className="pr-3 text-right text-slate select-none tabular-nums">{index + 1}</span>
                    <span>{line.length > 0 ? line : " "}</span>
                  </span>
                ) : (
                  line.length > 0 ? line : " "
                )}
              </span>
            ))}
          </code>
        </pre>
      </ScrollArea>

      {footer ? <div className="border-t border-line px-3 py-2 text-xs text-ink-dim">{footer}</div> : null}
    </figure>
  );
}
