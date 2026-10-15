import type { ReactNode } from "react";
import { Badge, type BadgeProps, type BadgeTone } from "../primitives/badge";

/** The head taxonomy the engine assigns from attention statistics. */
export type HeadRole =
  | "previous-token"
  | "induction"
  | "copying"
  | "positional"
  | "diffuse"
  | "attention-sink";

export const HEAD_ROLES: readonly HeadRole[] = [
  "previous-token",
  "induction",
  "copying",
  "positional",
  "diffuse",
  "attention-sink"
] as const;

export const HEAD_ROLE_LABELS: Record<HeadRole, string> = {
  "previous-token": "previous token",
  induction: "induction",
  copying: "copying",
  positional: "positional",
  diffuse: "diffuse",
  "attention-sink": "attention sink"
};

const HEAD_ROLE_TONES: Record<HeadRole, BadgeTone> = {
  "previous-token": "cyan",
  induction: "amber",
  copying: "violet",
  positional: "lime",
  diffuse: "slate",
  "attention-sink": "rose"
};

export interface HeadRoleBadgeProps extends Omit<BadgeProps, "tone" | "children"> {
  role: HeadRole;
  /** Override the default label. */
  children?: ReactNode;
}

/** A head's role, in the voice it is usually written in: `L0H1 · induction`. */
export function HeadRoleBadge({ role, children, ...rest }: HeadRoleBadgeProps) {
  return (
    <Badge tone={HEAD_ROLE_TONES[role]} title={HEAD_ROLE_LABELS[role]} {...rest}>
      {children ?? HEAD_ROLE_LABELS[role]}
    </Badge>
  );
}
