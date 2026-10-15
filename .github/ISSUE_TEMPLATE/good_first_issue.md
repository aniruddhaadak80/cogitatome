name: Good first issue
description: A scoped starter task (for contributors)
title: "good first issue: "
labels: ["good first issue"]
body:
  - type: dropdown
    id: area
    attributes:
      label: Area
      options:
        - Interpretability engine (`packages/core`)
        - Web UI (`apps/web`)
        - Design system (`packages/ui`)
        - Corpus (`packages/seed`)
        - Python worker (`services/agents`)
        - Go relay (`services/relay`)
        - Rust engine (`crates/engine`)
        - Docs (`docs/`)
  - type: textarea
    id: task
    attributes:
      label: The task
      description: One file, one test, concrete acceptance criteria.
    validations:
      required: true
  - type: textarea
    id: pointers
    attributes:
      label: Pointers
      description: Files to read first, and the command that proves it works.
      value: "Read packages/core/src/model.ts first. Prove it with: bun scripts/check-induction.ts"
    validations:
      required: true
