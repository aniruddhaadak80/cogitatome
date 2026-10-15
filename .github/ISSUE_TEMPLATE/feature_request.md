name: Feature request
description: Propose something the lab should do
title: "feat: "
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What question can you not answer with the lab today?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed solution
      description: Which route or module changes, and what does the reader learn?
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
  - type: checkboxes
    id: contract
    attributes:
      label: Contract
      options:
        - label: This can be built with zero API keys and deterministic behaviour
          required: true
        - label: I can include tests that prove it works against both models
          required: false
