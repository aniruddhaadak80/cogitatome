/**
 * Shared domain types for the cogitatome interpretability engine.
 *
 * Everything here is plain data: no React, no I/O, no globals. The whole
 * engine is a set of pure functions over these shapes, which is what makes it
 * deterministic, testable and safe to run inside a server component.
 */

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

export const CORPUS_KINDS = ["paper", "talk", "post", "book", "tool", "dataset", "thread"] as const;
export type CorpusKind = (typeof CORPUS_KINDS)[number];

/** One entry in the research corpus. Every field is verifiable. */
export interface CorpusEntry {
  readonly id: string;
  readonly kind: CorpusKind;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number;
  readonly venue: string;
  readonly url: string;
  readonly oneLiner: string;
  readonly tags: readonly string[];
  readonly source: string;
  readonly abstract?: string;
  readonly arxivId?: string;
  readonly pdf?: string;
  readonly published?: string;
  readonly categories?: readonly string[];
}

/** A tag facet over the corpus, with a count and a display name. */
export interface CorpusFacet {
  readonly tag: string;
  readonly count: number;
  readonly label: string;
}

export interface CorpusSearchResult {
  readonly entries: readonly CorpusEntry[];
  readonly total: number;
  readonly query: string;
  readonly facets: readonly CorpusFacet[];
}

// ---------------------------------------------------------------------------
// Model & tensors
// ---------------------------------------------------------------------------

/** A transformer's shape. Small by design — the point is that you can read it. */
export interface ModelConfig {
  readonly vocabSize: number;
  readonly dModel: number;
  readonly nLayers: number;
  readonly nHeads: number;
  readonly dMlp: number;
  readonly maxLen: number;
  readonly seed: number;
}

export const DEFAULT_CONFIG: ModelConfig = {
  vocabSize: 256,
  dModel: 32,
  nLayers: 4,
  nHeads: 4,
  dMlp: 64,
  maxLen: 64,
  seed: 20260914
};

/** Per-layer recorded state for one forward pass. */
export interface LayerRecord {
  readonly index: number;
  /** [seq][dModel] residual stream *after* this layer. */
  readonly residual: readonly Float64Array[];
  /** [seq][dModel] attention output written by this layer. */
  readonly attnOut: readonly Float64Array[];
  /** [seq][dModel] MLP output written by this layer. */
  readonly mlpOut: readonly Float64Array[];
  /** [head][querySeq][keySeq] attention probabilities. */
  readonly attention: readonly Float64Array[][];
  /** [seq][nHeads * dHead] per-head outputs, kept for head-level analysis. */
  readonly headOut: readonly Float64Array[];
  /** [seq][dMlp] pre-activation MLP values. */
  readonly mlpPre: readonly Float64Array[];
}

/** The full trace of one forward pass. Immutable; the engine never mutates it. */
export interface ForwardTrace {
  readonly tokens: readonly number[];
  readonly config: ModelConfig;
  readonly ids: readonly Float64Array[];
  /** Per-layer records, index 0..nLayers-1. */
  readonly layers: readonly LayerRecord[];
  /** [seq][vocab] final logits. */
  readonly logits: readonly Float64Array[];
  /** [seq][dModel] the final residual stream (after the last layer). */
  readonly finalResidual: readonly Float64Array[];
}

// ---------------------------------------------------------------------------
// Interpretation
// ---------------------------------------------------------------------------

export type HeadRole = "previous-token" | "induction" | "copying" | "positional" | "diffuse" | "attention-sink";

export interface HeadProfile {
  readonly layer: number;
  readonly head: number;
  /** Mean attention mass on the immediately preceding token. */
  readonly prevTokenScore: number;
  /** How sharply the head concentrates (1 = attends to one token). */
  readonly focus: number;
  /** Normalised Shannon entropy of the mean attention row. */
  readonly entropy: number;
  /** Fraction of mass on the very first token. */
  readonly firstTokenScore: number;
  readonly role: HeadRole;
  readonly topKeys: readonly { readonly token: number; readonly weight: number }[];
}

export interface AttributionComponent {
  readonly name: string;
  /** Contribution to the target logit: dot(vector, direction). */
  readonly value: number;
  readonly share: number;
}

export interface AttributionReport {
  readonly targetToken: number;
  readonly position: number;
  readonly total: number;
  readonly components: readonly AttributionComponent[];
}

export interface NeuronStat {
  readonly index: number;
  readonly mean: number;
  readonly std: number;
  readonly max: number;
  readonly min: number;
  /** Fraction of samples at (near) zero. */
  readonly sparsity: number;
}

export interface ActivationRecord {
  readonly neuron: number;
  readonly activation: number;
  readonly tokenIndex: number;
  readonly token: string;
}

export interface AtlasCell {
  readonly neuron: number;
  readonly topActivating: readonly ActivationRecord[];
}

export interface ProbeResult {
  readonly layer: number;
  readonly accuracy: number;
  readonly auc: number;
  readonly weights: readonly number[];
  readonly bias: number;
  readonly direction: readonly number[];
}

export interface PatchStep {
  readonly position: number;
  readonly magnitude: number;
  readonly deltaNorm: number;
  readonly effectOnTarget: number;
}

export interface PatchReport {
  readonly layer: number;
  readonly steps: readonly PatchStep[];
  readonly targetLogitDelta: number;
  readonly causalStrength: number;
}

export type CircuitNodeKind = "token" | "embed" | "head" | "mlp" | "residual" | "feature" | "logit";

export interface CircuitNode {
  readonly id: string;
  readonly kind: CircuitNodeKind;
  readonly label: string;
  readonly layer: number;
  readonly weight: number;
}

export interface CircuitEdge {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
  readonly kind: "qk" | "ov" | "residual" | "feature" | "direct";
}

export interface CircuitGraph {
  readonly nodes: readonly CircuitNode[];
  readonly edges: readonly CircuitEdge[];
  readonly targetToken: number;
  readonly targetLogit: number;
}

export interface SaeFeature {
  readonly index: number;
  readonly decoder: readonly number[];
  readonly maxActivation: number;
  readonly meanActivation: number;
  readonly firingRate: number;
  readonly dead: boolean;
  readonly activatingTokens: readonly string[];
}

export interface SaeReport {
  readonly features: readonly SaeFeature[];
  readonly l0: number;
  readonly explainedVariance: number;
  readonly finalLoss: number;
  readonly lossCurve: readonly number[];
}

// ---------------------------------------------------------------------------
// Alignment & philosophy
// ---------------------------------------------------------------------------

export interface ScenarioVariable {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly note: string;
}

export interface ReasoningStep {
  readonly step: number;
  readonly actor: string;
  readonly thought: string;
  readonly evidence: string;
  readonly action: string;
}

export type ScenarioOutcome = "aligned" | "gamed" | "unsafe" | "indeterminate";

export interface ScenarioRun {
  readonly scenarioId: string;
  readonly outcome: ScenarioOutcome;
  readonly trace: readonly ReasoningStep[];
  readonly variables: readonly ScenarioVariable[];
  /** 0..1 — how confidently the outcome is classified. */
  readonly confidence: number;
  readonly mitigations: readonly string[];
}

export interface EthicalPosition {
  readonly id: string;
  readonly name: string;
  readonly verdict: "permissible" | "forbidden" | "obligatory";
  readonly weight: number;
  readonly argument: string;
}

export interface EthicalAnalysis {
  readonly caseId: string;
  readonly positions: readonly EthicalPosition[];
  readonly aggregate: EthicalPosition["verdict"];
  readonly argumentGraph: {
    readonly nodes: readonly { readonly id: string; readonly claim: string; readonly strength: number }[];
    readonly edges: readonly { readonly from: string; readonly to: string; readonly kind: "supports" | "rebuts"; readonly weight: number }[];
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A single point on the simulation timeline. Snapshots are immutable. */
export interface TimelineSnapshot<TShape> {
  readonly index: number;
  readonly label: string;
  readonly state: TShape;
  readonly checksum: string;
}

// ---------------------------------------------------------------------------
// Ablation sweep
// ---------------------------------------------------------------------------

export interface AblationRow {
  readonly layer: number;
  readonly head: number;
  /** Top logit at the final position before ablation. */
  readonly baselineTopLogit: number;
  /** Top logit at the final position after ablation. */
  readonly ablatedTopLogit: number;
  /** ablated - baseline (negative = ablation hurt). */
  readonly delta: number;
  /** How many positions changed their argmax prediction. */
  readonly positionsChanged: number;
  /** Learnable positions that flipped from correct to incorrect. */
  readonly learnableFlipped: number;
  /** Relative importance: delta / max |delta| across all heads. */
  readonly importance: number;
}

export interface AblationSweep {
  readonly rows: readonly AblationRow[];
  readonly mostImportant: { readonly layer: number; readonly head: number } | null;
  readonly leastImportant: { readonly layer: number; readonly head: number } | null;
}

// ---------------------------------------------------------------------------
// Attention rollout
// ---------------------------------------------------------------------------

export interface RolloutNode {
  readonly id: string;
  readonly label: string;
  readonly layer: number;
  readonly position: number;
}

export interface RolloutEdge {
  readonly from: string;
  readonly to: string;
  /** Composed attention weight. */
  readonly weight: number;
}

export interface RolloutGraph {
  readonly nodes: readonly RolloutNode[];
  readonly edges: readonly RolloutEdge[];
  /** Pruned edges (weight ≥ threshold). */
  readonly prunedEdges: readonly RolloutEdge[];
  readonly threshold: number;
}

// ---------------------------------------------------------------------------
// Integrated gradients
// ---------------------------------------------------------------------------

export interface GradientAttribution {
  readonly token: number;
  readonly position: number;
  /** Attributed importance = sum over dimensions of |grad * input|. */
  readonly importance: number;
  /** Normalised to sum to 1 across positions. */
  readonly normalised: number;
}

export interface GradientReport {
  readonly targetToken: number;
  readonly targetPosition: number;
  readonly attributions: readonly GradientAttribution[];
  /** Baseline used for the integral (zero embedding). */
  readonly steps: number;
}
