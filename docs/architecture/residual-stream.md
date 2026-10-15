# The residual stream

A transformer adds; it does not overwrite. Every head and every MLP writes
into one shared vector per position, and the unembedding reads the sum. That
vector is the residual stream, and everything in this lab is a way of reading
it.

In cogitatome the stream is 64-dimensional with named lanes: dims 0–15 carry
the current token's identity, 16–31 carry the previous token's identity
(written by L0.H0), 32–47 carry sinusoidal position codes, 48–63 are a noise
lane for the distractor head. Lanes are an analytic convenience — real models
don't have them — but the principle transfers: the stream is a sum of writes,
and attribution is the art of un-summing it.

`logitAttribution` does the un-summing exactly: `logit = unembedᵀ·(embed +
Σ attnOut + Σ mlpOut)`, one dot product per writer. `residualDecomposition`
reports the same split as norms and shares for the UI bars. See
`docs/diagrams/02-forward-pass-sequence.mmd`.
