# Superposition and sparse autoencoders

Superposition: a layer with `d` dimensions represents more than `d` features
by packing them into almost-orthogonal directions. Neurons become
polysemantic — one neuron fires for several unrelated reasons — and reading
neurons reads mixtures.

The lab quantifies it with the participation ratio of the activation
covariance spectrum (`superpositionScore`): 1 means one direction per
dimension, higher means interference. The constructed model's MLP scores low
by design; the seeded dictionary data (`activations.jsonl`, 160 atoms in 64
dims) scores high, which is why the SAE has something to do.

The SAE (`trainSae`) learns a wider dictionary under L1: encoder, ReLU,
decoder with unit-norm rows, dead-feature resampling from real residuals. L0
in single digits and explained variance above 0.9 on the toy. Production
caveats — splitting, absorption, scale — are documented on the features page,
not hidden. See `docs/diagrams/13-sae-training.mmd`.
