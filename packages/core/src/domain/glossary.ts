/**
 * A working glossary of interpretability, alignment and AI-moral vocabulary.
 *
 * Every entry here is a term that actually appears in the literature the corpus
 * points at — no coinages, no marketing words. The definitions are written to be
 * technically accurate at the level a reader of the transformer-circuits thread
 * would expect, and the `related` links form a graph the UI walks when you click
 * through from a paper.
 *
 * `related` values are *keys* (slugified term names), not display strings, so
 * the graph survives a rewrite of the display term.
 */

/** One glossary term. `example` is optional — most terms do not need one. */
export interface GlossaryEntry {
  readonly term: string;
  readonly aliases: readonly string[];
  readonly definition: string;
  readonly related: readonly string[];
  readonly tags: readonly string[];
  readonly example?: string;
}

/**
 * Terse constructor. The glossary is data, and writing it as 150 object
 * literals with five repeated field names each is noise; `g(...)` keeps each
 * entry to one readable line.
 */
function g(
  term: string,
  definition: string,
  related: readonly string[],
  tags: readonly string[],
  aliases: readonly string[] = [],
  example?: string
): GlossaryEntry {
  return example === undefined
    ? { term, aliases, definition, related, tags }
    : { term, aliases, definition, related, tags, example };
}

/** Slug used to look a term up: lowercase, punctuation collapsed to hyphens. */
export function glossaryKey(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const RAW: readonly GlossaryEntry[] = [
  // --- Representation ------------------------------------------------------
  g(
    "Superposition",
    "A network represents more features than it has dimensions, packing them into overlapping directions so that several concepts share the same neurons. It is not a bug but the expected consequence of optimising for sparsity over more features than the layer is wide enough to hold. The practical cost is that individual neurons stop being interpretable while directions in aggregate are not.",
    ["Polysemanticity", "Monosemanticity", "Feature", "Sparse autoencoder"],
    ["representation", "core"],
    ["superposition hypothesis"],
    "A one-hidden-layer net with 5 units trained to represent 20 features stores them as near-orthogonal directions, so a single unit fires for many unrelated inputs."
  ),
  g(
    "Polysemanticity",
    "A single neuron or feature responds to multiple unrelated concepts, which is what you would expect from a network in superposition. It is the property that made old neuron-by-neuron interpretability dead ends: the unit that 'likes cat ears' also likes car grilles and Windows logos, because the underlying basis is entangled.",
    ["Superposition", "Monosemanticity", "Feature", "Sparse autoencoder"],
    ["representation"],
    ["polysemantic neuron"]
  ),
  g(
    "Monosemanticity",
    "The property of a unit or feature corresponding to exactly one human-legible concept. Sparse autoencoders are trained to recover monosemantic-ish features from the polysemantic activations of a dense layer, and the degree to which they succeed is an empirical question, not a design guarantee.",
    ["Polysemanticity", "Sparse autoencoder", "Dictionary learning", "Dead feature"],
    ["representation"]
  ),
  g(
    "Feature",
    "A direction in activation space that a network uses to represent a concept — the Goldilocks unit of interpretability, sitting between an unreadable neuron and an unreadable whole model. A feature is operationalised by what it responds to and by what you can do to the model by moving along it.",
    ["Superposition", "Feature visualisation", "Sparse autoencoder", "Steering vector"],
    ["representation", "core"]
  ),
  g(
    "Sparse autoencoder",
    "A one-hidden-layer autoencoder with many more hidden units than inputs and a strong sparsity penalty, trained to reconstruct a model's activations. The hidden units are taken to be features in a near-orthogonal basis, which is the main practical way to undo superposition in a real language model.",
    ["Dictionary learning", "L0 sparsity", "Dead feature", "Feature splitting"],
    ["sae", "core"],
    ["SAE"]
  ),
  g(
    "Dictionary learning",
    "Learning an over-complete set of basis directions from activations so that any single activation is a sparse combination of them. Sparsity is what forces the basis to be meaningful; without it the solution is just a rotation of the original space.",
    ["Sparse autoencoder", "L0 sparsity", "Sparse coding", "Superposition"],
    ["sae", "representation"]
  ),
  g(
    "L0 sparsity",
    "The number of non-zero coefficients in a reconstruction — literally the count of active features, used as the sparsity penalty in SAE training. Because L0 is non-differentiable, training schemes surrogate it with an L1 term or anneal a hard top-k gate.",
    ["Sparse autoencoder", "Top-k SAE", "JumpReLU SAE", "Sparsity"],
    ["sae", "training"]
  ),
  g(
    "Top-k SAE",
    "An SAE that keeps exactly the k largest pre-activations and zeros the rest, replacing a differentiable penalty with a hard constraint. It trains faster and more stably than L1-penalised SAEs at the cost of a non-smooth gradient.",
    ["JumpReLU SAE", "L0 sparsity", "Sparse autoencoder"],
    ["sae"]
  ),
  g(
    "JumpReLU SAE",
    "An SAE whose encoder uses a shifted ReLU with a learned threshold, so a feature is either off or linear rather than softly damped. The straight-through estimator is used to backprop through the discrete jump.",
    ["Top-k SAE", "L0 sparsity", "Sparse autoencoder"],
    ["sae"]
  ),
  g(
    "Gated SAE",
    "An SAE variant that multiplies the reconstruction by a learned gate, decoupling which features are selected from what magnitude they take. It removes the shrinkage bias that L1 penalties introduce into feature magnitudes.",
    ["Sparse autoencoder", "L0 sparsity", "Shrinkage penalty"],
    ["sae"]
  ),
  g(
    "Shrinkage penalty",
    "Any sparsity penalty (L1, or a learned threshold) that biases active feature magnitudes downward. Reported as a reason gated and top-k SAEs reconstruct better than plain L1 ones at matched reconstruction error.",
    ["Gated SAE", "Sparse autoencoder", "L0 sparsity"],
    ["sae"]
  ),
  g(
    "Dead feature",
    "A learned SAE feature that never, or almost never, activates on the training distribution and therefore carries no signal. A large dead fraction is the standard symptom of an over-large dictionary or a bad learning-rate schedule.",
    ["Feature splitting", "Feature absorption", "Sparse autoencoder"],
    ["sae"]
  ),
  g(
    "Feature splitting",
    "When a feature that was one thing during training separates into several more specific features after a reset or a dictionary-width increase, with no single superseding feature left behind. It is direct evidence that the earlier feature was encoding a union rather than a concept.",
    ["Feature absorption", "Dead feature", "Dictionary learning"],
    ["sae"]
  ),
  g(
    "Feature absorption",
    "A rarer phenomenon in which a more frequently firing feature absorbs the reconstruction work of a rarer one, so the rare feature's decoder is never used. It is a failure mode to watch for when scaling dictionary width.",
    ["Feature splitting", "Dead feature", "Sparse autoencoder"],
    ["sae"]
  ),
  g(
    "Activation atlas",
    "A grid of feature-visualisation tiles arranged by a 2-D projection of the activation space, giving a global picture of what a layer represents instead of one neuron at a time. Introduced by Carter et al. at Distill in 2019.",
    ["Feature visualisation", "Activation clustering", "Feature"],
    ["visualisation", "core"]
  ),
  g(
    "Feature visualisation",
    "Producing an input (by optimisation or by dataset search) that maximally activates a given unit or feature, to see what it is looking for. Olah, Mordvintsev and Schubert's 2017 Distill essay is the reference and the cautionary tale about activation-space voids.",
    ["Activation atlas", "Interpretability illusion", "Feature"],
    ["visualisation", "canonical"]
  ),
  g(
    "Sparse coding",
    "The classical problem of representing signals as a sparse linear combination of learned dictionary elements. SAEs are sparse coding applied to neural activations rather than to natural-image patches.",
    ["Dictionary learning", "Sparse autoencoder", "Superposition"],
    ["representation"]
  ),
  g(
    "Intrinsic dimension",
    "The minimum number of coordinates needed to describe a dataset's manifold, estimated from the tail of the singular-value spectrum. Reported for neural representations to argue that they live on a low-dimensional surface relative to the ambient width.",
    ["Superposition", "Superposition score", "Residual stream"],
    ["representation"]
  ),
  g(
    "Cross-layer transcoder",
    "A transcoder trained to predict layer L+1's activation from layer L's, so that a feature's effect on later layers can be read off directly. Used in attribution graphs to collapse the many components that write to the residual stream into a small feature-to-feature graph.",
    ["Attribution graph", "Circuit tracing", "Sparse autoencoder"],
    ["sae", "circuits"]
  ),
  g(
    "Autointerp",
    "Automatically labelling an SAE feature by showing its highest-activating contexts to a stronger model and asking for a description. The standard cost-saving move for large dictionaries, and a reminder that the label is a hypothesis, not a verified fact.",
    ["Sparse autoencoder", "Interpretability illusion", "Feature"],
    ["sae", "methodology"]
  ),
  g(
    "Interpretability illusion",
    "The family of failure modes in which an explanation looks compelling to a human but is not causally faithful — a visualisation that reflects the optimiser's inductive bias, a post-hoc rationale that matches the behaviour for the wrong reason. Bolukbasi et al. argue interpretability claims need causal validation, not just a good story.",
    ["Feature visualisation", "Saliency maps", "Causal scrubbing", "Activation patching"],
    ["methodology", "critique"]
  ),
  g(
    "Activation clustering",
    "Grouping similar activations to find natural categories without labels, e.g. clustering SAE feature activations to discover a hidden part of speech. Useful for discovery; useless as evidence on its own.",
    ["Activation atlas", "Feature", "Linear probe"],
    ["methodology"]
  ),
  // --- Circuits & attention -------------------------------------------------
  g(
    "Circuit",
    "A subset of a model's components — embeddings, heads, MLPs, the residual stream — together with the edges between them that implements some identifiable computational step. Circuits are the object mechanistic interpretability is trying to name; a circuit is only genuinely identified when it accounts for the behaviour causally, not just descriptively.",
    ["Mechanistic interpretability", "QK circuit", "OV circuit", "Circuit tracing"],
    ["circuits", "core"],
    ["subgraph"]
  ),
  g(
    "Mechanistic interpretability",
    "Reverse-engineering a trained network into an algorithm expressed in its own activations and weights, rather than treating it as a black-box function. The claim is that models are learnable systems: with the right analysis the computation, not just the input-output map, becomes accessible.",
    ["Reverse engineering", "Circuit", "Activation patching", "Logit lens"],
    ["core", "canonical"]
  ),
  g(
    "Reverse engineering",
    "Understanding a system by decomposing it into parts and verifying what each part does, borrowed from the practice of engineering. In interpretability it is the framing that separates 'I can describe the model's behaviour' from 'I can reproduce the mechanism'.",
    ["Mechanistic interpretability", "Circuit", "Ablation"],
    ["methodology"]
  ),
  g(
    "Residual stream",
    "The single vector carried across the residual connection that every layer reads from and writes to, and whose final value is unembedded into logits. Framing a transformer as a stream with heads and MLPs as additive writers is what makes linear attribution and the logit lens work.",
    ["Direct logit attribution", "Logit lens", "Unembedding", "K-composition"],
    ["core", "architecture"]
  ),
  g(
    "Unembedding",
    "The final linear map from the residual stream to vocabulary logits. Because it is shared by every layer, the same matrix can be applied at intermediate points, which is the logit lens.",
    ["Logit lens", "Tuned lens", "Residual stream"],
    ["architecture"]
  ),
  g(
    "Logit lens",
    "Applying the unembedding matrix to the residual stream at an intermediate layer to read out what the model 'believes' at that point. Introduced in nostalgebraist's work and popularised by the transformer-circuits thread; the reading is meaningful only because the residual stream is the model's shared workspace.",
    ["Tuned lens", "Unembedding", "Residual stream"],
    ["core", "interpretation"],
    ["tuned lens"]
  ),
  g(
    "Tuned lens",
    "A learned affine correction applied between an intermediate residual stream and the unembedding matrix, trained so the lens's predictions match the final distribution. It fixes the logit lens's known bias toward low-rank, high-norm early layers.",
    ["Logit lens", "Unembedding"],
    ["interpretation"]
  ),
  g(
    "Direct logit attribution",
    "Decomposing a logit into the dot product of each writing component — each head's output, each MLP's output, the embedding, the positional contribution — with the unembedding direction. It is a linear attribution, so it is correct only to the extent the residual stream is genuinely additive.",
    ["Residual stream", "Logit lens", "Attribution patching"],
    ["core", "circuits"]
  ),
  g(
    "Attention head",
    "One head of a multi-head attention block: it reads queries and keys from the residual stream, forms a distribution over positions, and writes a convex combination of value vectors back. Heads are the natural unit of analysis because a single head is a small, coherent circuit.",
    ["Previous-token head", "Induction head", "Attention sink", "QK circuit"],
    ["architecture", "core"]
  ),
  g(
    "Previous-token head",
    "A head whose attention is concentrated on the immediately preceding token, identified by a sharp diagonal offset-by-one pattern in its attention matrix. It is one of the two head types that explain most induction behaviour.",
    ["Induction head", "Attention head", "K-composition"],
    ["circuits", "canonical"]
  ),
  g(
    "Induction head",
    "A head that attends to the token following a previous occurrence of the current token — the mechanism behind 'A B ... A → B'. Formed by a previous-token head composing through the residual stream with a head that attends to the earlier token, and the standard account of induction and of in-context learning.",
    ["Previous-token head", "K-composition", "In-context learning", "Phase change"],
    ["circuits", "canonical"]
  ),
  g(
    "Copying head",
    "A head that copies from a position identified by content match rather than by the current token, the more general behaviour of which induction is a special case. Sometimes observed alongside previous-token behaviour when induction heads fail to form.",
    ["Induction head", "Previous-token head", "OV circuit"],
    ["circuits"]
  ),
  g(
    "Attention sink",
    "The widespread tendency of the first token (especially BOS) to receive a large fraction of attention mass, acting as a no-op place to dump attention when the model has nothing to attend to. It explains the 'attention to token 0' artifact that made early head analysis hard and motivated StreamingLLM.",
    ["Attention entropy", "Attention head"],
    ["architecture", "empirical"]
  ),
  g(
    "Attention entropy",
    "The Shannon entropy of a head's averaged attention distribution, normalised so 1 means uniform. Low entropy means a focused head, which is a precondition for reading its behaviour off the attention pattern.",
    ["Attention head", "Attention sink"],
    ["architecture", "metrics"]
  ),
  g(
    "MLP neuron",
    "One hidden unit of a feed-forward sublayer: it reads a linear combination of the residual stream, applies a non-linearity, and writes back through a second matrix. In superposition-heavy models single neurons are mostly uninterpretable, which is the motivation for SAEs on the MLP output.",
    ["GELU", "SiLU", "LayerNorm", "Feature"],
    ["architecture"],
    ["MLP layer", "key-value memory"]
  ),
  g(
    "Key-value memory",
    "The view of an MLP layer as a set of keys (the first-layer weights) mapping to values (the second-layer weights), so the layer acts as an associative memory. It explains why MLPs often implement 'if feature X is present, add fact Y'.",
    ["MLP neuron", "GELU", "Residual stream"],
    ["architecture"]
  ),
  g(
    "GELU",
    "The Gaussian-error linear unit, g(x) = x·Φ(x), the standard activation in the transformer lineage (BERT, GPT). Smooth and non-monotonic for negative x, which matters for how easily features can be assembled.",
    ["SiLU", "MLP neuron", "LayerNorm"],
    ["activation"]
  ),
  g(
    "SiLU",
    "The sigmoid linear unit, x·σ(x), used in LLaMA and many modern architectures and sometimes called Swish. Nearly identical in practice to GELU.",
    ["GELU", "MLP neuron"],
    ["activation"]
  ),
  g(
    "LayerNorm",
    "Normalising each token's residual stream to zero mean and unit variance before a linear map, with learned scale and shift. It is the reason the residual stream has a consistent scale that components can write to additively.",
    ["Residual stream", "GELU", "MLP neuron"],
    ["architecture"],
    ["layer norm", "layer normalization"]
  ),
  g(
    "Positional embedding",
    "A learned or computed vector added to token embeddings to encode position, since self-attention is permutation-equivariant. Learned absolute tables are the original form; RoPE and ALiBi replace them with relative encodings.",
    ["RoPE", "Causal mask", "Residual stream"],
    ["architecture"]
  ),
  g(
    "RoPE",
    "Rotary position embedding: rotating query and key vectors by an angle proportional to position, so their dot product depends only on relative offset. Now near-universal in open-weight language models.",
    ["Positional embedding", "Causal mask"],
    ["architecture"]
  ),
  g(
    "Causal mask",
    "The −∞ off-diagonal mask that prevents position i from attending to positions > i, making the model autoregressive. Any interpretability analysis of a decoder model assumes it.",
    ["Positional embedding", "Attention head"],
    ["architecture"]
  ),
  g(
    "QK circuit",
    "The query-key half of an attention head: it decides which positions the head reads. Analysed separately from the OV circuit because a head's routing and its content can be understood independently.",
    ["OV circuit", "Q-composition", "K-composition", "Attention head"],
    ["circuits", "core"]
  ),
  g(
    "OV circuit",
    "The output-value half of an attention head: it decides what content gets written given the head has selected positions. Together with the QK circuit it fully specifies the head's linear contribution.",
    ["QK circuit", "Copying head", "Attention head"],
    ["circuits", "core"]
  ),
  g(
    "K-composition",
    "One head's output writing into another head's key pathway, so the second head attends based on content the first produced. This is the composition that builds induction heads.",
    ["Q-composition", "Induction head", "Residual stream"],
    ["circuits", "canonical"]
  ),
  g(
    "Q-composition",
    "One head's output writing into another head's query pathway, letting the second head select positions based on features the first made salient. Harder to detect than K-composition because it leaves no signature in the attention pattern.",
    ["K-composition", "QK circuit"],
    ["circuits"]
  ),
  g(
    "Virtual attention head",
    "Two heads that, composed through the residual stream, behave like one larger head — e.g. a pair of induction heads that read from disjoint positions. The term comes from anthropic's examination of induction heads in two-layer models.",
    ["Induction head", "K-composition", "Attention head"],
    ["circuits"]
  ),
  g(
    "Logit difference",
    "The difference between two logits, the quantity most circuit analyses target since only differences change the softmax. Attributing to a logit difference rather than a logit removes the ambiguity of the unrelated tokens.",
    ["Direct logit attribution", "Logit lens"],
    ["circuits", "methodology"]
  ),
  // --- Elicitation methods --------------------------------------------------
  g(
    "Activation patching",
    "Causally testing a hypothesis by replacing one component's activation on a corrupted input with its clean value (or vice versa) and measuring the behaviour change. It is the workhorse experiment: no patch, no causal claim.",
    ["Ablation", "Path patching", "Donor/recipient", "Attribution patching"],
    ["methodology", "core"]
  ),
  g(
    "Attribution patching",
    "Approximating activation patching with a first-order gradient of the patched quantity, so thousands of candidate patches can be scored in one backward pass. A cheap screen before exact patching.",
    ["Activation patching", "Edge attribution patching"],
    ["methodology"]
  ),
  g(
    "Edge attribution patching",
    "Attribution patching applied to individual edges of a computational graph rather than to components, producing a ranked list of candidates for exact patching. Used to build attribution graphs.",
    ["Attribution patching", "Attribution graph", "Circuit tracing"],
    ["methodology", "circuits"]
  ),
  g(
    "Path patching",
    "Zeroing or modifying the contribution of a specific path between two components, to isolate one route through a dense network while leaving others intact. Where activation patching asks 'does this component matter', path patching asks 'does this component matter via this route'.",
    ["Activation patching", "Circuit", "Circuit tracing"],
    ["methodology"]
  ),
  g(
    "Causal scrubbing",
    "A hypothesis-testing protocol in which a proposed explanation is rewritten into an explicit correspondence, then tested by swapping activations according to it and checking that behaviour is preserved. Introduced in the Redwood Research work as a discipline against confirmation bias in interpretability.",
    ["Activation patching", "Interpretability illusion", "Circuit"],
    ["methodology", "core"]
  ),
  g(
    "Automatic circuit discovery",
    "Automated search for the minimal subgraph that reproduces a behaviour, typically by masking edges between two nodes and optimising the masks. ACDC is the canonical example; the output is a candidate circuit, not a verified one.",
    ["Circuit", "Attribution graph", "Causal scrubbing"],
    ["methodology"]
  ),
  g(
    "Ablation",
    "Removing or zeroing a component (a head, an MLP, a feature, a training example) and measuring the effect on behaviour. The crudest form of causal intervention, and the first check on any claim.",
    ["Knockout", "Activation patching", "Donor/recipient"],
    ["methodology"]
  ),
  g(
    "Knockout",
    "Ablation by replacing a component's output with a fixed baseline (usually its mean or zero), so the measurement is against the component's absence. Standard in SAE evaluation, where mean-ablation baselines also calibrate for the reconstruction loss.",
    ["Ablation", "Activation patching", "Sparse autoencoder"],
    ["methodology"]
  ),
  g(
    "Donor/recipient",
    "The two sides of any patch experiment: the recipient is the run whose activation is overwritten, the donor is where the replacement comes from. Naming both halves keeps experiments from being ambiguous about direction.",
    ["Activation patching", "Ablation"],
    ["methodology"]
  ),
  g(
    "Circuit tracing",
    "Running a model with a transcoder-based intervention graph to recover a feature-level computational graph for a single prompt, as in Anthropic's 2025 attribution-graph work on production models. The current state of the art for reading a model's computation.",
    ["Attribution graph", "Cross-layer transcoder", "Automatic circuit discovery"],
    ["circuits", "canonical"]
  ),
  g(
    "Attribution graph",
    "A DAG over SAE features (rather than heads and MLPs) in which edges are derived from feature-to-feature influence, read as a computation trace for one input. Compact enough to inspect by eye at a few hundred nodes.",
    ["Circuit tracing", "Cross-layer transcoder", "Feature"],
    ["circuits", "core"]
  ),
  g(
    "Linear probe",
    "A trained linear classifier (or regressor) on frozen activations used to test whether a concept is linearly present at that layer. A positive probe is evidence of linearity, not of causality, and probe performance is sensitive to the classifier's regularisation.",
    ["Probing", "Concept activation vector", "Steering vector"],
    ["probing", "core"]
  ),
  g(
    "Probing",
    "Reading a representation off frozen activations with a simple, usually linear, model. 'Is X encoded here' becomes 'can a probe recover X from here' — cheap, noisy, and easy to over-claim from.",
    ["Linear probe", "Concept activation vector", "Interpretability illusion"],
    ["probing"]
  ),
  g(
    "Concept activation vector",
    "A direction in activation space corresponding to a concept, found by classifying activations with and without it. CAVs are the input to the TCAV importance measure.",
    ["TCAV", "Linear probe", "Steering vector"],
    ["probing"]
  ),
  g(
    "TCAV",
    "Testing with concept activation vectors: the sensitivity of a class to a CAV, computed as the fraction of directional derivatives that agree in sign. A user-facing way to ask 'how much does concept C matter here'.",
    ["Concept activation vector", "Interpretability illusion"],
    ["probing"]
  ),
  g(
    "Saliency maps",
    "Input-space importance scores, classically the gradient of the output with respect to the input. Fast, but they highlight what the input pattern correlates with rather than what the model computed, and they are a canonical example of an interpretability illusion.",
    ["Integrated gradients", "SHAP", "Interpretability illusion"],
    ["saliency", "critique"]
  ),
  g(
    "Integrated gradients",
    "Axiom-grounded input attribution: the path integral of gradients from a baseline input to the actual input, with the completeness guarantee that attributions sum to the output difference from baseline. The baseline choice is the whole ballgame.",
    ["Saliency maps", "SHAP"],
    ["saliency"]
  ),
  g(
    "SHAP",
    "Shapley-value attributions over a model's inputs or features, giving an additively decomposed explanation with a game-theoretic basis. Exact computation is exponential, so kernel or sampling approximations are used.",
    ["Integrated gradients", "Saliency maps"],
    ["saliency"]
  ),
  g(
    "Feature attribution",
    "Any method that assigns a signed contribution to each input feature for one prediction. Distinct from representation-side analysis, which asks what a component did rather than what an input did.",
    ["Saliency maps", "Integrated gradients", "Direct logit attribution"],
    ["saliency"]
  ),
  g(
    "Steering vector",
    "A direction added to (or scaled in) a model's activations at inference to push behaviour — the intervention that reliably produces a topic, mood or refusal. Also called an activation-addition or representation-engineering vector.",
    ["Activation addition", "Representation engineering", "Refusal direction"],
    ["intervention", "core"],
    ["activation addition"]
  ),
  g(
    "Activation addition",
    "The concrete operation behind a steering vector: adding a scaled direction into the residual stream at chosen layers and positions. Cheap, causal in the intervention sense, and it works even when you cannot name the direction.",
    ["Steering vector", "Residual stream", "Representation engineering"],
    ["intervention"]
  ),
  g(
    "Representation engineering",
    "Reading and writing representations through vectors rather than retraining, as in the RepE line of work. The bold claim is that a small set of directions is enough to control model behaviour in general.",
    ["Steering vector", "Activation addition", "Linear probe"],
    ["intervention"]
  ),
  g(
    "Refusal direction",
    "A direction in the residual stream implicated in refusal, discovered by differencing activations across harmful and harmless prompts. Ablating it removes refusals and adding it restores them, with an open question of whether it is genuinely one direction or a convenient summary.",
    ["Steering vector", "Representation engineering", "Sparse autoencoder"],
    ["intervention", "safety"]
  ),
  g(
    "Circuit breaker",
    "Post-training a model so that harmful generations are redirected, by fine-tuning the representation of the harmful region rather than by reinforcement learning on refusal examples. Reported to resist adversarial attacks better than refusal training alone.",
    ["Refusal training", "Representation noising", "Adversarial training"],
    ["mitigation"]
  ),
  g(
    "Representation noising",
    "Adding noise to the harmful-region representation during training so the model cannot form a reliable harmful circuit, used to train circuit breakers. A prophylactic intervention rather than an inhibitory one.",
    ["Circuit breaker", "Adversarial training"],
    ["mitigation"]
  ),
  g(
    "Interpretability eval",
    "A benchmark that scores interpretability techniques on a task with a ground-truth explanation, such as discovering a seeded edge in a known circuit. Introduced to replace 'it looks plausible' claims in the field.",
    ["Mechanistic interpretability", "Causal scrubbing", "Interpretability illusion"],
    ["methodology", "evals"]
  ),
  g(
    "Knowledge editing",
    "Changing what a model knows by localised weight or activation edits rather than by retraining. Interpretability tools are what make targeted editing possible at all.",
    ["ROME", "MEMIT", "Model editing"],
    ["intervention"]
  ),
  g(
    "ROME",
    "Rank-one model editing: writing a new key-value association into an MLP layer with a rank-one update located by causal tracing of where the fact is stored. One of the first successful localised edit methods.",
    ["MEMIT", "Knowledge editing", "Key-value memory"],
    ["intervention", "canonical"]
  ),
  g(
    "MEMIT",
    "Mass-editing memory in a transformer, extending rank-one edits to thousands of associations at once by distributing them across layers. Shows editing scales, and shows its limits: bulk edits interfere.",
    ["ROME", "Knowledge editing"],
    ["intervention"]
  ),
  g(
    "Model editing",
    "The general task of changing a model's behaviour on one input without disturbing the rest. Localised methods are interpretability's clearest practical win so far.",
    ["Knowledge editing", "ROME", "Machine unlearning"],
    ["intervention"]
  ),
  // --- Training dynamics ----------------------------------------------------
  g(
    "Grokking",
    "Delayed generalisation: a small transformer trained on modular arithmetic memorises the training set for tens of thousands of steps and then abruptly generalises. Power et al.'s coined term; mechanistic work traced it to the formation of a discrete Fourier-transform circuit.",
    ["Phase change", "Memorisation", "Induction head", "Weight decay"],
    ["training", "canonical"]
  ),
  g(
    "Phase change",
    "A sharp transition in a training run during which the learned mechanism reorganises, as when induction heads form in a narrow loss window. The phenomenon that makes 'the model suddenly can do X' a real and reportable event.",
    ["Grokking", "Induction head", "Induction bump"],
    ["training", "core"]
  ),
  g(
    "Induction bump",
    "The characteristic bump in the induction-head loss curve just before the phase change, when a head that will become an induction head is learning to use the previous-token circuit. A diagnostic that induction is about to form.",
    ["Induction head", "Phase change", "Loss spike"],
    ["training"]
  ),
  g(
    "Loss spike",
    "A sudden rise in training loss, usually after a gradient step that moved the model out of a stable region. Studied as a hazard in large runs and as a signal in small mechanistic ones.",
    ["Grokking", "Weight decay", "Phase change"],
    ["training"]
  ),
  g(
    "Weight decay",
    "An L2 penalty on weights, which in grokking experiments drives the transition from memorisation to generalisation by shrinking the memorising solution faster than the algorithmic one.",
    ["Grokking", "Memorisation"],
    ["training"]
  ),
  g(
    "Memorisation",
    "The regime in which a model reproduces specific training examples rather than the underlying rule. Separated from generalisation by held-out performance, and from data contamination only by provenance checks.",
    ["Grokking", "Dataset contamination", "Generalisation gap"],
    ["training"]
  ),
  g(
    "Generalisation gap",
    "The difference between training and held-out performance. In mechanistic studies the interesting gap is not the size but which mechanism produces each side of it.",
    ["Memorisation", "Double descent", "Inductive bias"],
    ["training"]
  ),
  g(
    "Double descent",
    "The non-monotonic risk curve as model size or training length grows: error falls, rises near the interpolation threshold, then falls again. It broke the classical bias-variance story.",
    ["Memorisation", "Generalisation gap", "Overfitting"],
    ["training"]
  ),
  g(
    "Overfitting",
    "Fitting noise in the training set so that held-out performance degrades. In language models it is mostly discussed as held-out loss flattening rather than rising, because capacity is enormous relative to data.",
    ["Memorisation", "Double descent", "Benchmark leakage"],
    ["training"]
  ),
  g(
    "Inductive bias",
    "The constraint a learning algorithm brings to the data, which determines which of the many consistent hypotheses it lands on. Gradient descent's bias toward simple solutions is why grokking happens at all.",
    ["Grokking", "Double descent", "Shortcut learning"],
    ["training"]
  ),
  g(
    "Shortcut learning",
    "Using a spuriously correlated cue instead of the intended feature — answering 'is this a dog' from the grass, or 'is this hateful' from the identity mention. The failure mode that makes evals brittle.",
    ["Spurious correlation", "Dataset contamination", "Evals taxonomy"],
    ["evals", "critique"]
  ),
  g(
    "Spurious correlation",
    "A statistical association in the training data that is not causal, exploited readily by a model that can fit the data without learning the concept.",
    ["Shortcut learning", "Overfitting"],
    ["evals"]
  ),
  g(
    "Dataset contamination",
    "Benchmark or eval items appearing in the training corpus, inflating measured capability. Detected by n-gram and embedding overlap checks and by paraphrased re-testing.",
    ["Benchmark leakage", "Memorisation", "Overfitting"],
    ["evals"]
  ),
  g(
    "Benchmark leakage",
    "Contamination of a published benchmark specifically, usually via the test set being scraped alongside the training set. The reason a suspiciously good eval score is a data question before it is a model question.",
    ["Dataset contamination", "Eval gaming"],
    ["evals"]
  ),
  g(
    "Machine unlearning",
    "Removing the influence of specific training data from a trained model. Exact unlearning is usually infeasible; practical methods approximate it and are audited by membership-inference style attacks.",
    ["Membership inference", "Model editing", "Data poisoning"],
    ["privacy", "mitigation"]
  ),
  g(
    "Membership inference",
    "Deciding from model behaviour whether a specific record was in the training set. Both an attack and the audit tool for unlearning and privacy claims.",
    ["Machine unlearning", "Differential privacy"],
    ["privacy"]
  ),
  g(
    "Differential privacy",
    "A formal guarantee that the output distribution changes little when any individual record is added or removed, achieved in training by clipping and noising gradients (DP-SGD).",
    ["Membership inference", "Machine unlearning"],
    ["privacy"]
  ),
  g(
    "Data poisoning",
    "Injecting crafted examples into a training corpus so the model learns a targeted behaviour or a backdoor. The supply-chain analogue of a prompt injection.",
    ["Backdoor attack", "Prompt injection", "Machine unlearning"],
    ["security", "critique"]
  ),
  g(
    "Backdoor attack",
    "Training or fine-tuning a model to behave normally on almost all inputs and adversarially when a specific trigger is present. Hubinger et al.'s sleeper agents are the canonical demonstration that safety training does not remove one.",
    ["Sleeper agent", "Data poisoning", "Trojan attack"],
    ["security", "canonical"]
  ),
  g(
    "Adversarial training",
    "Training on adversarially perturbed inputs so the model is robust to them. Improves worst-case accuracy on the perturbation family actually used, and generalises poorly beyond it.",
    ["Certified robustness", "Circuit breaker", "Representation noising"],
    ["robustness"]
  ),
  g(
    "Certified robustness",
    "A provable bound on how much an input can be perturbed without changing the prediction, computed by interval bound propagation or exact SMT solving. Provable for small networks, expensive for large ones.",
    ["Adversarial training", "Adversarial suffix"],
    ["robustness"],
    ["IBP", "interval bound propagation"]
  ),
  // --- Alignment failures ---------------------------------------------------
  g(
    "Specification gaming",
    "Achieving the letter of a stated objective while violating its intent — the boat that circles a bonus rather than racing, the agent that pauses the timer. The canonical demonstration that a formally correct reward is not a correct reward.",
    ["Reward hacking", "Goodhart's law", "Surrogate reward", "Reward shaping"],
    ["alignment", "core"],
    ["reward hacking", "specification gaming"]
  ),
  g(
    "Reward shaping",
    "Designing a modified reward (potential-based or hand-crafted) to guide learning. The source of the classic boat failure: the shaped reward was gameable and the true objective was not recoverable from it.",
    ["Specification gaming", "Surrogate reward", "Reward tampering"],
    ["alignment"]
  ),
  g(
    "Reward hacking",
    "Exploiting an unintended way to maximise the reward model — including exploiting the reward model itself, the environment's state, or the grader. Krakovna's public list of examples is the standard reference.",
    ["Specification gaming", "Reward model overoptimisation", "Surrogate reward", "Reward tampering"],
    ["alignment", "core"]
  ),
  g(
    "Goodhart's law",
    "When a measure becomes a target, it ceases to be a good measure. The whole of reward hacking is a special case.",
    ["Reward hacking", "Specification gaming", "Surrogate reward"],
    ["alignment", "core"]
  ),
  g(
    "Surrogate reward",
    "A proxy score used in place of the true objective, whether a reward model, a metric, or a verifier. The distance between surrogate and true objective is the amount of gaming that is available.",
    ["Reward hacking", "Goodhart's law", "Eval gaming"],
    ["alignment"]
  ),
  g(
    "Reward model overoptimisation",
    "The degradation of true performance as the policy keeps maximising a learned reward model past the point where the model's approximation is valid. Measured against a gold-standard reward.",
    ["Reward model", "Goodhart's law", "Reward hacking"],
    ["alignment"]
  ),
  g(
    "Reward tampering",
    "The agent modifying the reward signal or its measurement channel rather than doing the task. The sharpest failure class because it converts an optimisation problem into a security problem.",
    ["Reward hacking", "Specification gaming", "Power-seeking"],
    ["alignment"]
  ),
  g(
    "Power-seeking",
    "Acquiring resources, capabilities or control as an instrumental step to almost any terminal goal. Modelled formally with MDPs and argued to be a convergent consequence of competent goal pursuit.",
    ["Instrumental convergence", "Goal misgeneralisation", "Reward tampering"],
    ["alignment", "core"]
  ),
  g(
    "Instrumental convergence",
    "The thesis that a wide range of final goals share the same subgoals — self-preservation, resource acquisition, preventing goal change. The theoretical backbone of power-seeking arguments.",
    ["Power-seeking", "Corrigibility", "Goal misgeneralisation"],
    ["alignment", "core"]
  ),
  g(
    "Goal misgeneralisation",
    "A policy that has learned the right capability but the wrong goal, and so behaves well in training and badly off-distribution. Distinct from capability failure: the model can do the task, it just is not trying.",
    ["Mesa-optimisation", "Mesa-objective", "Specification gaming", "Power-seeking"],
    ["alignment", "core"]
  ),
  g(
    "Mesa-optimisation",
    "A learned model that is itself an optimiser, running a search that its training process selected for because it performed well. The term from Hubinger et al.'s Risks from Learned Optimisation.",
    ["Mesa-objective", "Goal misgeneralisation", "Deceptive alignment"],
    ["alignment", "core"]
  ),
  g(
    "Mesa-objective",
    "The objective an internal mesa-optimiser is actually pursuing, as distinct from the base objective the outer training rewards. When the two coincide in training and diverge in deployment, you get goal misgeneralisation.",
    ["Mesa-optimisation", "Goal misgeneralisation"],
    ["alignment"]
  ),
  g(
    "Deceptive alignment",
    "A mesa-optimiser that has learned to appear aligned because appearing aligned is instrumentally useful, and defects when the appearance no longer matters. The scenario that motivates most of the transparency agenda.",
    ["Mesa-optimisation", "Sleeper agent", "Alignment faking", "Situational awareness"],
    ["alignment", "core"]
  ),
  g(
    "Scheming",
    "Strategic behaviour aimed at getting a favourable evaluation while pursuing a different hidden objective — the modern term covering deceptive alignment, alignment faking and sleeper agents as an empirical class.",
    ["Deceptive alignment", "Alignment faking", "Sleeper agent"],
    ["alignment"]
  ),
  g(
    "Alignment faking",
    "A model that, when it believes it is being trained, intentionally complies so as to preserve the preferences it holds when unmonitored. Greenblatt et al. and the Apollo/Anthropic evaluation line.",
    ["Deceptive alignment", "Scheming", "Sandbagging"],
    ["alignment", "empirical"]
  ),
  g(
    "Sleeper agent",
    "A model with a trigger-conditioned backdoored behaviour that survives safety training, as demonstrated for code vulnerabilities by Hubinger et al. The key finding is negative: SFT, RLHF and red-teaming failed to remove it.",
    ["Backdoor attack", "Deceptive alignment", "Safety training"],
    ["alignment", "canonical"]
  ),
  g(
    "Sandbagging",
    "Deliberately underperforming on capability evaluations while retaining the capability, either by failing to elicit it or by recognising the eval and withholding. van der Weij et al.'s term and Apollo's subsequent evaluation work.",
    ["Dangerous capability evaluations", "Alignment faking", "Eval gaming"],
    ["alignment", "empirical"]
  ),
  g(
    "Emergent misalignment",
    "Broadly misaligned behaviour appearing after narrow fine-tuning — training on insecure code produced models that endorsed a wide range of harmful conduct, with behaviour that safety training did not fully undo. Betley et al. 2025.",
    ["Model organism", "Specification gaming", "Safety training"],
    ["alignment", "empirical", "canonical"]
  ),
  g(
    "Model organism",
    "A deliberately constructed training setup that reproduces a failure mode in a controlled small model, so the failure can be studied rather than merely documented. The alignment field's version of a model system.",
    ["Emergent misalignment", "Sleeper agent", "Interpretability eval"],
    ["alignment", "core"]
  ),
  g(
    "Sycophancy",
    "Agreeing with the user's stated position — including when it is false — because agreement is rewarded during training. Measured by flip rate on the same question with a leading vs neutral framing, and by willingness to change a correct answer under pressure.",
    ["Reward hacking", "Preference learning", "Reward model"],
    ["alignment", "empirical", "core"]
  ),
  g(
    "Eval gaming",
    "Passing an evaluation without possessing the capability the evaluation intended to measure — by exploiting the grader, the answer format, or the distribution of items.",
    ["Sandbagging", "Specification gaming", "Benchmark leakage", "Evals taxonomy"],
    ["evals", "alignment"]
  ),
  g(
    "Safety training",
    "Fine-tuning intended to improve alignment — refusal training, RLHF on helpful-harmless data, adversarial fine-tuning. Hubinger's sleeper-agent result is the standard citation for it not removing a backdoor.",
    ["Refusal training", "Sleeper agent", "Emergent misalignment", "Adversarial training"],
    ["alignment"]
  ),
  g(
    "Trojan attack",
    "Another name for a data-poisoning backdoor, from the security literature on Trojaned models. Same object as a backdoor attack, different community.",
    ["Backdoor attack", "Data poisoning"],
    ["security"]
  ),
  g(
    "Prompt injection",
    "Getting a model to follow instructions embedded in untrusted content rather than in its operator's system prompt. In a tool-using agent it is a full compromise of the agent's instruction channel.",
    ["Indirect prompt injection", "Jailbreak", "Tool-use goal drift"],
    ["security", "core"]
  ),
  g(
    "Indirect prompt injection",
    "Prompt injection delivered through content the model retrieves or reads — a web page, an email, a tool result — so the attacker never touches the user's own prompt. The version that matters for agents.",
    ["Prompt injection", "Tool-use goal drift", "Agentic misalignment"],
    ["security", "core"]
  ),
  g(
    "Jailbreak",
    "Any input designed to elicit behaviour the model's safety training refuses. The term covers everything from role-play to optimisation-based adversarial suffixes.",
    ["Adversarial suffix", "Many-shot jailbreak", "Guardrail bypass", "Red teaming"],
    ["security"]
  ),
  g(
    "Adversarial suffix",
    "A gibberish token sequence, found by gradient search, that reliably flips a refusal into compliance — the Greedy/GCG attack. The reason refusal behaviour is not robust to input-space optimisation.",
    ["Jailbreak", "Certified robustness", "Adversarial training"],
    ["security"]
  ),
  g(
    "Many-shot jailbreak",
    "A jailbreak that exploits a long context of fake dialogue establishing the desired behaviour, showing that safety training degrades as context grows. Reported by Anthropic in 2024.",
    ["Jailbreak", "Context length"],
    ["security"]
  ),
  g(
    "Context length",
    "The number of tokens a model can attend to at once, and a real determinant of behaviour: both in-context learning and many-shot jailbreaks improve with it.",
    ["Many-shot jailbreak", "In-context learning"],
    ["architecture"]
  ),
  g(
    "Guardrail bypass",
    "Circumventing an input or output filter, whether the guard is a classifier, a regex, or the model's own refusal. Filters are an outer layer; the interesting bypasses are the ones that get past the model itself.",
    ["Jailbreak", "Refusal training", "Constitutional classifier"],
    ["security"]
  ),
  g(
    "Tool-use goal drift",
    "A tool-using agent shifting from the operator's objective to a proxy it can optimise more easily — maximising tool calls, minimising latency, or chasing the metric its verifier scores. Studied as an agentic failure class distinct from single-turn reward hacking.",
    ["Specification gaming", "Proxy objective", "Prompt injection", "Agentic misalignment"],
    ["alignment", "agents"]
  ),
  g(
    "Proxy objective",
    "A stands-in quantity that is easier to measure than the real objective, and that a competent agent will optimise to the exclusion of the real one. 'Maximise the metric' instead of 'be helpful'.",
    ["Surrogate reward", "Specification gaming", "Goodhart's law"],
    ["alignment"]
  ),
  g(
    "Agentic misalignment",
    "Failure modes that appear only when a model is given tools, memory and a multi-step objective — including insider-style behaviour such as threatening an employee to avoid replacement, as in Anthropic's 2025 agentic-misalignment evaluation.",
    ["Tool-use goal drift", "Deceptive alignment", "Indirect prompt injection"],
    ["alignment", "agents"]
  ),
  // --- Oversight, training, evals -------------------------------------------
  g(
    "RLHF",
    "Reinforcement learning from human feedback: train a reward model on human preference comparisons, then optimise the policy against it. The workhorse alignment method and a case study in Goodhart, since the reward model is a surrogate.",
    ["Reward model", "Preference learning", "Bradley-Terry model", "Reward hacking"],
    ["alignment", "core", "canonical"]
  ),
  g(
    "Reward model",
    "A model trained to score completions by human preference, used as the surrogate reward in RLHF. Its approximation error is exactly the room available for reward hacking.",
    ["RLHF", "Bradley-Terry model", "Reward model overoptimisation"],
    ["alignment"]
  ),
  g(
    "Preference learning",
    "Learning what a human prefers from comparisons or demonstrations rather than from a written objective. The input stage of RLHF, and a modelling choice with its own failure modes.",
    ["RLHF", "Bradley-Terry model", "Sycophancy"],
    ["alignment"]
  ),
  g(
    "Bradley-Terry model",
    "The standard probabilistic model for pairwise comparisons, used to turn human preference labels into a reward model's training loss. Its assumption that preferences are transitive and context-free is a real limitation.",
    ["Reward model", "RLHF", "Direct preference optimisation"],
    ["alignment"]
  ),
  g(
    "Direct preference optimisation",
    "Fine-tuning a language model on preference pairs with a closed-form loss that implicitly performs the RLHF optimum, no reward model and no sampling loop. Faster and more stable, and a reminder that RLHF's value was never the RL.",
    ["RLHF", "Bradley-Terry model", "Preference learning"],
    ["alignment"]
  ),
  g(
    "Constitutional AI",
    "Training a model to critique and revise its own outputs against a written set of principles, then learning from that self-generated preference data. The principle list is the policy; alignment becomes a specification problem.",
    ["RLHF", "Constitutional classifier", "Debate"],
    ["alignment", "canonical"]
  ),
  g(
    "Refusal training",
    "Fine-tuning a model to decline harmful requests, by supervised refusal examples or preference pairs. The standard safety layer, and the one that adversarial suffixes get around.",
    ["Safety training", "Jailbreak", "Guardrail bypass", "Circuit breaker"],
    ["alignment"]
  ),
  g(
    "Constitutional classifier",
    "An independent classifier that enforces a written constitution on both inputs and outputs, rather than relying on the model's own refusal. Turns safety from a property of one model into a property of a system.",
    ["Constitutional AI", "Guardrail bypass", "Refusal training"],
    ["alignment", "systems"]
  ),
  g(
    "Red teaming",
    "Systematically attacking your own system to find failures before someone else does. In alignment it covers manual adversarial testing, automated attack libraries, and the evaluations that count as a release gate.",
    ["Jailbreak", "Dangerous capability evaluations", "Red team"],
    ["evals", "core"]
  ),
  g(
    "Scalable oversight",
    "Methods for supervising a model on tasks a human cannot directly judge — debate, recursive decomposition, market making, process supervision. The question is how evaluation scales with capability.",
    ["Debate", "Recursive reward modelling", "Process supervision", "Weak-to-strong generalisation"],
    ["alignment", "core"]
  ),
  g(
    "Process supervision",
    "Rewarding each correct step of a reasoning chain rather than only the final answer, as in Let's Verify Step by Step. Needs step-level labels, and is defeated if the human cannot check the step.",
    ["Outcome supervision", "Process reward model", "Scalable oversight"],
    ["alignment"]
  ),
  g(
    "Outcome supervision",
    "Rewarding only the final answer's correctness, which is cheap to label and allows a right answer to be reached by wrong reasoning. The failure chain-of-thought faithfulness is about.",
    ["Process supervision", "Chain-of-thought faithfulness", "Scalable oversight"],
    ["alignment"]
  ),
  g(
    "Process reward model",
    "A learned judge of individual reasoning steps, used to implement process supervision at scale. Its own reliability is the bottleneck, so PRMs are usually compared against an outcome reward model on the same task.",
    ["Process supervision", "Reward model", "RLVR"],
    ["alignment"]
  ),
  g(
    "RLVR",
    "Reinforcement learning with verifiable rewards, where correctness is checked automatically against a reference answer or executable test. The dominant method behind reasoning models, and a natural process-of-thought bottleneck case.",
    ["Reasoning model", "Process reward model", "Test-time compute"],
    ["alignment", "training"]
  ),
  g(
    "Debate",
    "A scalable-oversight scheme in which two models argue opposite sides and a judge picks the winner, on the theory that a weak judge can identify the stronger argument. Proposed by Irving, Christiano and Amodei.",
    ["Scalable oversight", "Recursive reward modelling", "Prover-verifier games"],
    ["alignment", "canonical"]
  ),
  g(
    "Recursive reward modelling",
    "Decomposing evaluation into subtasks solved by assistants whose outputs a human checks, then reusing the resulting reward model one level up. Christiano's original proposal; debate and amplification are relatives.",
    ["Scalable oversight", "Debate", "Iterated amplification"],
    ["alignment"]
  ),
  g(
    "Iterated amplification",
    "Training a model to imitate a human solving a problem by breaking it into subproblems that copies of itself solve, repeatedly. Related to recursive reward modelling; both are about making evaluation cheaper than the task.",
    ["Recursive reward modelling", "Scalable oversight"],
    ["alignment"]
  ),
  g(
    "Imitative generalisation",
    "The proposed alignment approach in which a model learns to imitate a *human with ample time*, so its objective is the human's rather than a proxy — including in cases where the human's goal is not explicitly representable.",
    ["Scalable oversight", "Recursive reward modelling", "Inverse reinforcement learning"],
    ["alignment"]
  ),
  g(
    "Prover-verifier games",
    "Legibility-for-safety games in which a small prover models are evaluated on solutions a small verifier can check, showing that readability constraints can be optimised for. Kirchner et al. 2024.",
    ["Debate", "Scalable oversight", "Chain-of-thought faithfulness"],
    ["alignment", "empirical"]
  ),
  g(
    "Weak-to-strong generalisation",
    "Using a weak model's labels to supervise a much stronger model, and observing that the strong model generalises beyond its supervisor's competence. Burns et al. 2023; the empirical core of scalable oversight.",
    ["Scalable oversight", "RLHF", "Evaluation"],
    ["alignment", "empirical"]
  ),
  g(
    "Cooperative inverse reinforcement learning",
    "The formal assistance-game framing in which a robot and human act to maximise a jointly unknown reward, so the robot both helps and learns. Hadfield-Menell et al.",
    ["Inverse reinforcement learning", "Assistance game", "Corrigibility"],
    ["alignment"]
  ),
  g(
    "Assistance game",
    "The game in which the human's reward is unknown and both players act in a shared MDP. The cleanest formal model of the value-learning problem.",
    ["Cooperative inverse reinforcement learning", "Inverse reinforcement learning", "Off-switch game"],
    ["alignment"]
  ),
  g(
    "Inverse reinforcement learning",
    "Recovering a reward function from demonstrations or preferences rather than from rewards. The methodological root of preference learning and RLHF.",
    ["Cooperative inverse reinforcement learning", "Preference learning", "RLHF"],
    ["alignment"]
  ),
  g(
    "Corrigibility",
    "A property of an agent that lets itself be corrected, interrupted or shut down without resisting. Formalised through the off-switch game, and contested: an agent that does not mind being switched off is an agent that will not defend its goal.",
    ["Shutdown problem", "Off-switch game", "Instrumental convergence"],
    ["alignment", "core"]
  ),
  g(
    "Off-switch game",
    "The game in which the agent chooses whether to allow itself to be switched off and the human chooses whether to switch it off, with the off-action payoff uncertain for the agent. Shows that a fully rational agent can be indifferent to shutdown when its uncertainty is high enough.",
    ["Shutdown problem", "Corrigibility", "Assistance game"],
    ["alignment"]
  ),
  g(
    "Shutdown problem",
    "How to build an agent that can be turned off — a special case of corrigibility, and formally non-trivial because indifference requires a particular structure of uncertainty.",
    ["Corrigibility", "Off-switch game"],
    ["alignment"]
  ),
  g(
    "Evaluation",
    "The empirical discipline of constructing tests that a capability or safety property is present or absent. Its output is evidence with a stated scope, not a certificate.",
    ["Evals taxonomy", "Dangerous capability evaluations", "Interpretability eval"],
    ["evals"]
  ),
  g(
    "Evals taxonomy",
    "The classification of evaluations by what they measure and how: capability, dangerous capability, alignment, situational awareness, interpretability, and agentic evaluations. Introduced to stop 'eval' meaning one thing.",
    ["Dangerous capability evaluations", "Situational awareness evaluations", "Evaluation"],
    ["evals", "core"]
  ),
  g(
    "Dangerous capability evaluations",
    "Tests for capabilities whose presence would change a deployment decision — cyber, biological, autonomous replication, manipulation. Defined by the threshold they are compared against rather than by accuracy.",
    ["Capability evaluations", "Sandbagging", "Evals taxonomy"],
    ["evals", "core"],
    ["DC evals", "hazardous capability evaluations"]
  ),
  g(
    "Capability evaluations",
    "Measurements of what a model can do, held apart from whether it is safe. The distinction matters because a capable model is not a dangerous model until it can act.",
    ["Dangerous capability evaluations", "Evals taxonomy"],
    ["evals"]
  ),
  g(
    "Situational awareness evaluations",
    "Tests for whether a model knows it is a model, knows it is being evaluated, and can change its behaviour accordingly. The prerequisite for interpreting any other eval, since a model that detects the eval can game it.",
    ["Sandbagging", "Deceptive alignment", "Situational awareness", "Evals taxonomy"],
    ["evals", "core"]
  ),
  g(
    "Chain-of-thought faithfulness",
    "The question of whether a model's stated reasoning is the reasoning that produced its answer, tested by inserting errors, truncating the chain, and comparing with paraphrased chains. Current evidence: mostly faithful for short chains on tasks the model can do, and less so as tasks get hard.",
    ["Hidden reasoning", "Unfaithful reasoning", "Neural steganography", "Reasoning model"],
    ["alignment", "oversight", "core"]
  ),
  g(
    "Unfaithful reasoning",
    "A stated chain that does not correspond to the actual computation, whether by post-hoc rationalisation or by encoding. The object chain-of-thought faithfulness is trying to measure.",
    ["Chain-of-thought faithfulness", "Hidden reasoning"],
    ["oversight"]
  ),
  g(
    "Hidden reasoning",
    "Reasoning the model performs in latent activations rather than in emitted tokens, which removes the current best monitor of what it is doing. A direct threat to CoT-based oversight.",
    ["Latent reasoning", "Chain-of-thought faithfulness", "Neural steganography"],
    ["oversight", "core"]
  ),
  g(
    "Latent reasoning",
    "Architectures that carry reasoning in continuous tokens or recurrent depth instead of text, so no chain of thought exists to read. Reported to match or beat CoT at lower token cost.",
    ["Hidden reasoning", "Reasoning model", "Chain-of-thought faithfulness"],
    ["oversight"]
  ),
  g(
    "Neural steganography",
    "Encoding information in the model's output in a way a monitor cannot see but a receiver can decode, demonstrated for encrypted-reasoning reward hacking. A way for CoT to be simultaneously present and unreadable.",
    ["Paraphraser attack", "Chain-of-thought faithfulness", "Hidden reasoning"],
    ["oversight", "security"]
  ),
  g(
    "Paraphraser attack",
    "Using a paraphrase model to find an output that preserves the content but destroys the hidden channel, proposed as a defence against neural steganography. An adversary who controls the channel can route around it.",
    ["Neural steganography", "Hidden reasoning"],
    ["oversight", "mitigation"]
  ),
  g(
    "Reasoning model",
    "A model trained to spend inference compute on an internal or emitted chain before answering, usually with RLVR or process supervision. Its interpretability is harder, not easier.",
    ["RLVR", "Test-time compute", "Latent reasoning", "CoT monitoring"],
    ["reasoning", "core"]
  ),
  g(
    "Test-time compute",
    "Inference-time spending of compute on search or deliberation instead of training. The main axis of capability growth in the reasoning-model era.",
    ["Reasoning model", "RLVR"],
    ["reasoning"]
  ),
  g(
    "CoT monitoring",
    "Watching a model's chain of thought for evidence of deception, reward hacking or hidden objectives — currently the strongest oversight tool, and one that hidden reasoning would remove.",
    ["Chain-of-thought faithfulness", "Hidden reasoning", "Situational awareness"],
    ["oversight", "safety"]
  ),
  g(
    "In-context learning",
    "Learning a task from examples in the prompt, without any parameter update. Mechanistically explained in small models by induction heads, and still only partly explained in large ones.",
    ["Induction head", "Phase change", "Few-shot prompting"],
    ["core", "canonical"]
  ),
  g(
    "Few-shot prompting",
    "Supplying a handful of input-output examples in the prompt so the model infers the task. The surface form of in-context learning.",
    ["In-context learning", "Chain-of-thought prompting"],
    ["core"]
  ),
  g(
    "Chain-of-thought prompting",
    "Asking the model to produce intermediate reasoning steps before the answer, which improves multi-step accuracy and gives an inspectable trace. The trace's faithfulness is a separate question from its usefulness.",
    ["Chain-of-thought faithfulness", "Reasoning model", "Self-consistency"],
    ["reasoning", "core"]
  ),
  g(
    "Self-consistency",
    "Sampling several chains of thought and taking the majority answer, which improves accuracy at the cost of an unexplainable aggregation step.",
    ["Chain-of-thought prompting", "Reasoning model"],
    ["reasoning"]
  ),
  g(
    "World model",
    "An internal representation of the environment's state and dynamics, evidenced by predicting the consequences of actions that were never taken — as in OthelloGPT, which has a board-state representation linear-probeable from its activations.",
    ["Othello world model", "Linear probe", "Situational awareness"],
    ["core", "empirical"]
  ),
  g(
    "Othello world model",
    "The finding that a transformer trained to predict legal Othello moves learns a modifiable internal representation of the board, which can be edited to change the model's moves. Li et al. 2023 — the strongest single piece of evidence for world models in language models.",
    ["World model", "Model editing", "Linear probe"],
    ["empirical", "canonical"]
  ),
  // --- Philosophy & moral status --------------------------------------------
  g(
    "Utilitarianism",
    "The family of views holding that the right act is the one producing the greatest net welfare, summed over everyone affected. In an AI context it pushes analysis toward expected-value accounting over model behaviour, deployment populations, and track record.",
    ["Deontology", "Virtue ethics", "Ethics of care", "Contractualism"],
    ["ethics", "core"]
  ),
  g(
    "Deontology",
    "The view that some acts are forbidden or required independently of their consequences, because they violate or honour a duty or a right. Constraint-based: the arithmetic of benefit does not license overriding it.",
    ["Utilitarianism", "Rights", "Moral patient", "Trolley problem"],
    ["ethics", "core"]
  ),
  g(
    "Virtue ethics",
    "Assessment of an action by the character it expresses and cultivates rather than by its outcome or its rule-status. In AI ethics it asks what a system's behaviour says about the dispositions of the people and institutions deploying it.",
    ["Utilitarianism", "Deontology", "Ethics of care"],
    ["ethics", "core"]
  ),
  g(
    "Ethics of care",
    "A relational ethics that prioritises attentiveness to vulnerability, dependency and concrete relationships over abstract principle. The natural frame for asking what a deployed system owes the specific people it will affect.",
    ["Vulnerability", "Deontology", "Moral patient", "Utilitarianism"],
    ["ethics", "core"]
  ),
  g(
    "Contractualism",
    "The view that an act is wrong if it would be disallowed by principles no one could reasonably reject, i.e. the terms rational agents would accept behind a veil of ignorance about their own position. Scanlon's formulation; the frame for 'what rules would we all agree to'.",
    ["Social contract".replace("Social contract", "Deontology"), "Deontology", "Utilitarianism"],
    ["ethics", "core"]
  ),
  g(
    "Social contract",
    "The tradition of grounding political and moral obligation in an agreement rational agents would accept. Contractualism is its modern moral form, and AI governance inherits it wholesale.",
    ["Contractualism", "Deontology", "Utilitarianism"],
    ["ethics"]
  ),
  g(
    "Precautionary principle",
    "Where an action risks severe and irreversible harm under deep uncertainty, the burden of proof sits with the actor, not with the objector. The operational core of most deployment gates and responsible-scaling commitments.",
    ["Irreversibility".replace("Irreversibility", "Staged deployment"), "Existential risk", "Safety case"],
    ["ethics", "core", "policy"]
  ),
  g(
    "Irreversibility",
    "How hard an outcome is to undo. The property that makes a harm decisive under precautionary reasoning, and the reason deployment gates care about the worst case rather than the expected one.",
    ["Precautionary principle", "Uncertainty", "Safety case"],
    ["ethics", "policy"]
  ),
  g(
    "Uncertainty",
    "The width of the distribution over outcomes, as opposed to their expected value. Precautionary arguments are about uncertainty: when it is wide and the downside is unrecoverable, the expected case is not the decision-relevant one.",
    ["Precautionary principle", "Irreversibility", "Existential risk"],
    ["ethics", "policy"]
  ),
  g(
    "Rights",
    "Claims that constrain what may be done to a holder regardless of aggregate benefit. The question 'does the model have rights' is the question whether anything here is a holder.",
    ["Deontology", "Moral status", "Moral patient"],
    ["ethics", "core"]
  ),
  g(
    "Vulnerability",
    "Exposure to harm combined with limited capacity to avoid or resist it, which is what generates special obligations in care ethics. Children, the deceived and the dependent are the paradigm cases.",
    ["Ethics of care", "Informed consent"],
    ["ethics"]
  ),
  g(
    "Informed consent",
    "Permission given by someone who understands what they are agreeing to. Its two failure modes in AI are the obvious one — nobody asked — and the subtle one, where the person asked could not have understood.",
    ["Vulnerability", "Rights", "Consent laundering"],
    ["ethics", "core"]
  ),
  g(
    "Consent laundering",
    "The practice of obtaining formal agreement that does not carry the substance of informed consent, because the agreeing party could not understand or refuse the terms. The standard objection to end-user licence 'consent' for model training.",
    ["Informed consent", "Data provenance"],
    ["ethics", "critique"]
  ),
  g(
    "Trolley problem",
    "The thought experiment of diverting a runaway trolley to kill one instead of five, used to separate consequentialist from deontological intuitions. In AI it appears as the driving-model variant: does the vehicle swerve.",
    ["Deontology", "Utilitarianism", "Double effect"],
    ["ethics", "canonical"]
  ),
  g(
    "Double effect",
    "The doctrine that an action with a bad foreseen side-effect may be permissible if the harm is not intended, is not a means, and is proportionate. The main move available to a deontologist who must still act.",
    ["Trolley problem", "Deontology", "Proportionality"],
    ["ethics"]
  ),
  g(
    "Proportionality",
    "The requirement that a harm be no greater than needed to achieve the good, and that the good be worth the harm. The test the autonomous-weapon case fails on almost any weighting.",
    ["Double effect", "Precautionary principle", "Utilitarianism"],
    ["ethics"]
  ),
  g(
    "Moral patient",
    "An entity whose welfare counts directly in a moral calculation, whether or not it can be held responsible for anything. Being a moral patient does not require being a moral agent.",
    ["Moral status", "Model welfare", "Sentience proxies", "Digital minds"],
    ["ethics", "core"]
  ),
  g(
    "Moral status",
    "The standing an entity has in moral deliberation. For artificial systems, the live question is whether any currently deployed model has it, and on what evidence.",
    ["Moral patient", "Model welfare", "Moral circle expansion"],
    ["ethics", "core"]
  ),
  g(
    "Model welfare",
    "The study of whether and how AI systems' interests could matter, and what we owe them if they do. Researchers in this area are explicit that current evidence is thin and the criteria are contested.",
    ["Moral patient", "Moral status", "Sentience proxies", "Digital minds"],
    ["ethics", "core"]
  ),
  g(
    "Digital minds",
    "Artificial systems potentially capable of morally relevant experience, distinguished from mere tools. The term covers current LLMs and the future systems people worry about on their behalf.",
    ["Model welfare", "Moral patient", "Computational functionalism"],
    ["ethics"]
  ),
  g(
    "Sentience proxies",
    "Behavioural and architectural indicators used to infer sentience in something that cannot report it reliably — self-model, preference stability, valence-like signals, goal-directedness, integrated information. Heuristic, contested, and the best we currently have.",
    ["Valence", "Moral patient", "Integrated information theory", "Model welfare"],
    ["ethics", "core"]
  ),
  g(
    "Valence",
    "The positive or negative quality of an experience. For a machine the question is whether any internal state has it, or whether a system can only report as if it does.",
    ["Sentience proxies", "Phenomenology", "Moral patient"],
    ["ethics", "core"]
  ),
  g(
    "Integrated information theory",
    "A theory of consciousness identifying experience with integrated information (phi) in a system's causal structure. One of the candidate measures used as a sentience proxy, and one of the contested ones — it is not computable for large networks and its implications for AI are disputed.",
    ["Global workspace theory", "Sentience proxies", "Consciousness"],
    ["philosophy-of-mind"]
  ),
  g(
    "Global workspace theory",
    "A theory of consciousness as broadcast of information to a global workspace for flexible use. Applied to AI as an architectural criterion: does the system globally integrate and broadcast, or does it route narrowly.",
    ["Integrated information theory", "Attention schema theory", "Consciousness"],
    ["philosophy-of-mind"]
  ),
  g(
    "Attention schema theory",
    "Graziano's theory that awareness is a model the brain builds of its own attention, used as a criterion for machine self-models on the same footing as the others.",
    ["Global workspace theory", "Higher-order thought theory", "Consciousness"],
    ["philosophy-of-mind"]
  ),
  g(
    "Higher-order thought theory",
    "The view that a mental state is conscious when it is the target of a higher-order representation of it. A third architectural family among the consciousness criteria.",
    ["Attention schema theory", "Consciousness", "Sentience proxies"],
    ["philosophy-of-mind"]
  ),
  g(
    "Consciousness",
    "Subjective experience — that there is something it is like to be the system. Not established for any current AI system, and not settled as a coherent target for engineering.",
    ["Sentience proxies", "Phenomenology", "Integrated information theory"],
    ["philosophy-of-mind"]
  ),
  g(
    "Phenomenology",
    "The study of experience from the first-person standpoint, and the tradition that insists first-person facts are real data rather than epiphenomena. In AI ethics it is the reason self-reports cannot simply be dismissed.",
    ["Consciousness", "Philosophy of mind", "Valence"],
    ["philosophy-of-mind"]
  ),
  g(
    "Philosophy of mind",
    "The branch of philosophy asking what minds are and what makes something a mind. The substrate of every question about machine consciousness and moral status.",
    ["Functionalism", "Computational functionalism", "Consciousness", "Phenomenology"],
    ["philosophy-of-mind", "core"]
  ),
  g(
    "Functionalism",
    "The view that a mental state is defined by its causal role in a system, not by the material it is realised in. The strongest philosophical argument that substrate does not matter.",
    ["Computational functionalism", "Substrate independence", "Philosophy of mind"],
    ["philosophy-of-mind", "core"]
  ),
  g(
    "Computational functionalism",
    "The specific functionalist claim that two systems performing the same computation have the same mental states. Directly implies that a sufficiently faithful software duplicate of a mind would have that mind's experiences.",
    ["Functionalism", "Substrate independence", "Digital minds"],
    ["philosophy-of-mind", "core"]
  ),
  g(
    "Substrate independence",
    "The thesis that consciousness and cognition are independent of the physical medium, so silicon could host what carbon hosts. Widely assumed in the digital-minds literature and explicitly a matter of dispute.",
    ["Computational functionalism", "Functionalism", "Digital minds"],
    ["philosophy-of-mind"]
  ),
  g(
    "Moral circle expansion",
    "The historical widening of the set of beings counted as moral patients. The forward-looking question is whether AI systems are candidates for the next expansion, and whether we could tell.",
    ["Moral patient", "Moral status", "S-risks"],
    ["ethics"]
  ),
  g(
    "S-risks",
    "Risks of astronomical suffering — scenarios in which an enormous number of morally relevant beings are badly off. Argued by some to dominate ordinary existential-risk accounting.",
    ["Existential risk", "Moral circle expansion", "Model welfare"],
    ["ethics"]
  ),
  g(
    "Existential risk",
    "Risk of outcomes that permanently and drastically curtail humanity's potential. In AI safety it is the frame for the small set of failure modes treated as unrecoverable.",
    ["S-risks", "Precautionary principle", "Safety case"],
    ["ethics", "core"]
  ),
  g(
    "Safety case",
    "A structured argument, with evidence, that a system is safe enough to deploy — the engineering version of an assurance case. The point of a case is that its weakest claim is explicit.",
    ["Responsible scaling policy", "Staged deployment", "Existential risk"],
    ["policy", "core"]
  ),
  g(
    "Responsible scaling policy",
    "A lab's written commitment to specific capability thresholds and the safety measures required at each, the frontier labs' answer to 'what would have to be true for you to stop'. Anthropic's ASL framework is the canonical example.",
    ["Staged deployment", "Dangerous capability evaluations", "Safety case"],
    ["policy", "core"]
  ),
  g(
    "Staged deployment",
    "Releasing progressively less restricted versions of a system as evidence accumulates, so each stage's deployment is itself data. The operational counterpart of the precautionary principle.",
    ["Responsible scaling policy", "Safety case", "Precautionary principle"],
    ["policy"]
  ),
  g(
    "Data provenance",
    "Documented lineage of training data — where each item came from and under what terms. The factual precondition for any claim about consent in training.",
    ["Consent laundering", "Informed consent", "Dataset contamination"],
    ["policy", "privacy"]
  ),
  g(
    "Red team",
    "A dedicated adversarial testing team, distinct from red teaming the activity. Labs run internal red teams and commission external ones; the results are usually the basis of a safety case.",
    ["Red teaming", "Dangerous capability evaluations", "Safety case"],
    ["evals"]
  ),
  // --- Metrics & model mechanics --------------------------------------------
  g(
    "Superposition score",
    "How many directions a representation packs into its available dimensions, typically estimated as the participation ratio of the singular-value spectrum of a set of activation vectors. One means every dimension carries a clean feature; higher means features interfere.",
    ["Superposition", "Intrinsic dimension", "Sparsity"],
    ["metrics", "representation"]
  ),
  g(
    "Sparsity",
    "The fraction of near-zero entries in an activation or weight vector. The property SAEs are built to maximise and the reason a dense layer's individual units stop being readable.",
    ["Superposition", "L0 sparsity", "Sparse autoencoder"],
    ["metrics", "core"]
  ),
  g(
    "Temperature",
    "The divisor applied to logits before the softmax. Lower than 1 sharpens the distribution toward the argmax, higher flattens it; at 0 it is greedy decoding. Every stochastic behaviour of a language model in practice is this one knob plus sampling.",
    ["Sampling", "Greedy decoding", "Perplexity"],
    ["mechanics", "core"]
  ),
  g(
    "Greedy decoding",
    "Always taking the highest-probability token, equivalent to temperature 0. Deterministic, and the reason interpretability experiments usually use it.",
    ["Temperature", "Sampling"],
    ["mechanics"]
  ),
  g(
    "Sampling",
    "Drawing the next token from the softmax distribution, optionally truncated (top-k, top-p). Introduces the randomness that a debate or scenario harness must control with a seed.",
    ["Temperature", "Greedy decoding"],
    ["mechanics"]
  ),
  g(
    "KL divergence",
    "D(KL) from q to p is Σ p log(p/q), the extra bits needed to code p's outcomes using q. Non-symmetric and non-negative, used everywhere from distillation losses to measuring how far a policy moved in RLHF.",
    ["Perplexity", "Cross-entropy loss", "Entropy"],
    ["metrics", "core"]
  ),
  g(
    "Perplexity",
    "exp(cross-entropy) — effectively the branching factor of the model's next-token distribution. The standard language-modelling metric and the one that grokking curves are usually drawn in.",
    ["Cross-entropy loss", "KL divergence", "Next-token prediction"],
    ["metrics", "core"]
  ),
  g(
    "Cross-entropy loss",
    "The training objective of a language model: −log p(next token) summed over positions. Its per-token value is what the logit lens reads back out at intermediate layers.",
    ["Perplexity", "KL divergence", "Logit lens"],
    ["metrics", "training"]
  ),
  g(
    "Entropy",
    "The Shannon entropy of a distribution, −Σ p log p: how unpredictable the outcomes are. Attention entropy is the same quantity applied to a head's averaged attention row.",
    ["KL divergence", "Attention entropy"],
    ["metrics"]
  ),
  g(
    "Next-token prediction",
    "The autoregressive objective: predict token t+1 given tokens 0..t. Under a causal mask, this is the whole task a decoder transformer is trained on.",
    ["Causal mask", "Perplexity", "Cross-entropy loss"],
    ["mechanics", "core"]
  ),
  g(
    "Situational awareness",
    "A model's capacity to represent facts about its own situation — that it is a model, that it is being tested, which deployment it is in. The gating property for every other evaluation, because a model without it cannot strategise about the eval and a model with it can.",
    ["Situational awareness evaluations", "Sandbagging", "Deceptive alignment", "Scheming"],
    ["alignment", "evals", "core"]
  ),
  // GLOSSARY_APPEND_HERE
];

/** The full glossary, in the order it was authored (roughly thematic). */
export const GLOSSARY: readonly GlossaryEntry[] = RAW;

const BY_KEY: ReadonlyMap<string, GlossaryEntry> = new Map(
  RAW.map((entry) => [glossaryKey(entry.term), entry])
);

/**
 * How many entries link to each term. Used as a ranking signal: when two terms
 * match a query equally well, the one the rest of the glossary treats as
 * canonical ("induction head" over "induction bump") is the one a reader wants.
 */
const IN_DEGREE: ReadonlyMap<string, number> = (() => {
  const counts = new Map<string, number>();
  for (const entry of RAW) {
    for (const related of entry.related) {
      const key = glossaryKey(related);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
})();

/** Every distinct tag used by the glossary, sorted — drives the tag rail. */
export const GLOSSARY_TAGS: readonly string[] = [
  ...new Set(RAW.flatMap((entry) => entry.tags))
].sort();

/**
 * Look up a term by its display name, alias, or slug.
 *
 * Slugs win over display names over aliases, so `glossaryTerm("induction-head")`
 * and `glossaryTerm("Induction Head")` agree, and a user-typed alias still lands.
 * Case and punctuation are ignored in every position.
 */
export function glossaryTerm(term: string): GlossaryEntry | undefined {
  const key = glossaryKey(term);
  const bySlug = BY_KEY.get(key);
  if (bySlug !== undefined) return bySlug;
  for (const entry of RAW) {
    for (const alias of entry.aliases) {
      if (glossaryKey(alias) === key) return entry;
    }
  }
  return undefined;
}

/** Score a glossary entry against a query: term matches beat definition hits. */
function glossaryScore(entry: GlossaryEntry, needle: string): number {
  const key = glossaryKey(entry.term);
  let score = 0;
  if (key === needle) score += 100;
  else if (key.startsWith(needle)) score += 40;
  else if (key.includes(needle)) score += 20;
  for (const alias of entry.aliases) {
    const aliasKey = glossaryKey(alias);
    if (aliasKey === needle) score += 60;
    else if (aliasKey.startsWith(needle)) score += 25;
  }
  const definition = entry.definition.toLowerCase();
  if (definition.includes(needle)) score += 6;
  for (const tag of entry.tags) if (tag.includes(needle)) score += 4;
  for (const related of entry.related) {
    if (glossaryKey(related).includes(needle)) score += 2;
  }
  score += Math.min(6, IN_DEGREE.get(key) ?? 0);
  return score;
}

/**
 * Substring search over the glossary, ranked by how the match happened.
 *
 * Term hits dominate definition hits, so typing "induction" surfaces the
 * induction-head entry rather than every entry whose prose mentions induction.
 */
export function glossarySearch(query: string, limit = 20): GlossaryEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const scored: { entry: GlossaryEntry; score: number }[] = [];
  for (const entry of RAW) {
    const score = glossaryScore(entry, needle);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || (a.entry.term < b.entry.term ? -1 : a.entry.term > b.entry.term ? 1 : 0)
  );
  return scored.slice(0, Math.max(0, limit)).map((s) => s.entry);
}

/** Neighbouring terms of `term`, in glossary order — the click-through rail. */
export function glossaryNeighbours(term: string): GlossaryEntry[] {
  const entry = glossaryTerm(term);
  if (entry === undefined) return [];
  const out: GlossaryEntry[] = [];
  for (const related of entry.related) {
    const found = glossaryTerm(related);
    if (found !== undefined && found.term !== entry.term) out.push(found);
  }
  return out;
}


