name: Bug report
description: Something in the lab is wrong
title: "fix: "
labels: [bug]
body:
  - type: textarea
    id: what
    attributes:
      label: What happened?
      description: What did you do, and what did the lab do instead?
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What did you expect?
      description: If this is about the constructed model, state the numbers you expected (e.g. 19/19 learnable).
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Exact reproduction
      description: Route or endpoint, tokens/seed used, commands run.
      placeholder: "/dissect with tokens 0,1,2,3,4 ×6 · bun 1.3.14 · Windows 11"
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs
      description: Paste the gate output (typecheck / lint / test) or the browser console error.
      render: shell
  - type: checkboxes
    id: keys
    attributes:
      label: Zero-keys check
      options:
        - label: This reproduces with no API keys, no network, and a fresh `bun install`
          required: true
