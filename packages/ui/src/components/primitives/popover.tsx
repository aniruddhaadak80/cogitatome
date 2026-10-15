import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode
} from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export type PopoverSide = "top" | "right" | "bottom" | "left";

export interface PopoverProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** Trigger label. The trigger is always a real `<button>`. */
  label: ReactNode;
  /** Panel contents. */
  children: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "signal";
  side?: PopoverSide;
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  panelClassName?: string;
  /** Match the panel width to the trigger instead of fitting content. */
  matchWidth?: boolean;
}

const SIDES: Record<PopoverSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "top-1/2 right-full -translate-y-1/2 mr-2",
  right: "top-1/2 left-full -translate-y-1/2 ml-2"
};

/**
 * A non-modal popover.
 *
 * It deliberately does not trap focus or dim the page — that is `<Dialog>`'s
 * job — but it does close on Escape, on an outside pointer press, and on focus
 * leaving the group, and it hands focus back to the trigger.
 */
export function Popover({
  label,
  children,
  triggerVariant = "secondary",
  side = "bottom",
  open,
  defaultOpen = false,
  onOpenChange,
  panelClassName,
  matchWidth = false,
  className,
  ref,
  ...rest
}: PopoverProps) {
  const uid = useId();
  const panelId = `popover-${uid}`;
  const [internal, setInternal] = useState(defaultOpen);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internal;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInternal(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, setOpen]);

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
      }}
      className={cn("relative inline-flex", className)}
      onBlur={(event) => {
        if (!isOpen) return;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      {...rest}
    >
      <Button
        ref={triggerRef}
        variant={triggerVariant}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(!isOpen)}
      >
        {label}
      </Button>

      <div
        role="dialog"
        id={panelId}
        aria-label={typeof label === "string" ? label : "Popover"}
        hidden={!isOpen}
        className={cn(
          "panel absolute z-50 p-3 text-base text-ink",
          SIDES[side],
          matchWidth ? "w-full min-w-48" : "min-w-48",
          panelClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
