export interface NavSection {
  readonly href: string;
  readonly label: string;
  readonly blurb: string;
}

/** Primary navigation. Every entry is a real route, not a placeholder. */
export const NAV_SECTIONS: readonly NavSection[] = [
  { href: "/dissect", label: "Dissect", blurb: "Step through a forward pass and read the residual stream." },
  { href: "/heads", label: "Heads", blurb: "Profile every attention head and classify what it does." },
  { href: "/circuits", label: "Circuits", blurb: "Discover and prune the computational graph." },
  { href: "/features", label: "Features", blurb: "Train a sparse autoencoder and read the dictionary." },
  { href: "/probes", label: "Probes", blurb: "Fit linear probes and measure what is linearly readable." },
  { href: "/sandbox", label: "Sandbox", blurb: "Run eight alignment scenarios with visible reasoning." },
  { href: "/ethics", label: "Ethics", blurb: "Six ethical positions argue over an AI moral case." },
  { href: "/corpus", label: "Corpus", blurb: "Search 600+ real papers, talks, posts and threads." },
  { href: "/timeline", label: "Timeline", blurb: "Rewind and diff any simulation state." },
  { href: "/ablation", label: "Ablation", blurb: "Remove every head and rank by importance." },
  { href: "/rollout", label: "Rollout", blurb: "Compose attention matrices across layers." },
  { href: "/attribution", label: "Attribution", blurb: "Which input tokens matter for the prediction." }
];

export const NAV_MAP: ReadonlyMap<string, NavSection> = new Map(NAV_SECTIONS.map((s) => [s.href, s]));
