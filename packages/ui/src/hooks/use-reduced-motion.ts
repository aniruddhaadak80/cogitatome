import { useMediaQuery } from "./use-media-query";

/** True when the user has asked the OS to reduce motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
