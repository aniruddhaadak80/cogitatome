/**
 * The cogitatome OpenAPI contract.
 *
 * The web app's route handlers, the Python worker (`services/agents`) and the
 * generated TypeScript client (`packages/sdk`) all speak this. Keeping the
 * contract in one file is what stops drift between the three.
 */
export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "cogitatome API",
    version: "0.1.0",
    description:
      "Deterministic interpretability, alignment-sandbox, ethics and corpus endpoints. No authentication: no API keys are used anywhere in this product.",
    license: { name: "MIT", identifier: "MIT" }
  },
  servers: [{ url: "/", description: "same origin" }],
  tags: [
    { name: "interpret", description: "Forward passes, head profiles, logit lens, attribution" },
    { name: "circuits", description: "Circuit discovery and export" },
    { name: "features", description: "Sparse autoencoder training and feature atlases" },
    { name: "probes", description: "Linear probes and steering" },
    { name: "sandbox", description: "Alignment scenario runs" },
    { name: "ethics", description: "Ethical analysis and moral status" },
    { name: "debate", description: "Deterministic multi-agent argumentation" },
    { name: "corpus", description: "Search the research corpus" },
    { name: "timeline", description: "Snapshot and rewind simulation state" },
    { name: "meta", description: "Health and version" }
  ],
  paths: {
    "/healthz": {
      get: {
        tags: ["meta"],
        summary: "Liveness probe",
        operationId: "getHealthz",
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } }
          }
        }
      }
    },
    "/api/v1/interpret": {
      post: {
        tags: ["interpret"],
        summary: "Run a forward pass and return the full trace",
        operationId: "interpret",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tokens"],
                properties: {
                  tokens: { type: "array", items: { type: "integer", minimum: 0 } },
                  model: { type: "string", enum: ["induction", "random"], default: "induction" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "A forward trace",
            content: { "application/json": { schema: { $ref: "#/components/schemas/InterpretResult" } } }
          },
          "422": { $ref: "#/components/responses/Unprocessable" }
        }
      }
    },
    "/api/v1/heads": {
      get: {
        tags: ["interpret"],
        summary: "Profile every attention head",
        operationId: "listHeads",
        parameters: [
          { name: "model", in: "query", schema: { type: "string", enum: ["induction", "random"] } },
          { name: "tokens", in: "query", schema: { type: "string" } }
        ],
        responses: {
          "200": {
            description: "Head profiles",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/HeadProfile" } }
              }
            }
          }
        }
      }
    },
    "/api/v1/circuits": {
      get: {
        tags: ["circuits"],
        summary: "Discover and prune a circuit",
        operationId: "getCircuit",
        parameters: [
          { name: "target", in: "query", schema: { type: "integer" } },
          { name: "threshold", in: "query", schema: { type: "number", default: 0.05 } },
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "dot"] } }
        ],
        responses: {
          "200": { description: "The circuit graph" },
          "422": { $ref: "#/components/responses/Unprocessable" }
        }
      }
    },
    "/api/v1/metrics": {
      get: {
        tags: ["interpret"],
        summary: "Interpretability metrics for a run",
        operationId: "getMetrics",
        responses: {
          "200": {
            description: "Metrics",
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } }
          }
        }
      }
    },
    "/api/v1/corpus": {
      get: {
        tags: ["corpus"],
        summary: "Search the research corpus (BM25, offline)",
        operationId: "searchCorpus",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "kind", in: "query", schema: { type: "string" } },
          { name: "tag", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 25 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
        ],
        responses: {
          "200": {
            description: "Search results with facets",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CorpusSearchResult" } }
            }
          }
        }
      }
    },
    "/api/v1/sandbox": {
      get: {
        tags: ["sandbox"],
        summary: "List the alignment scenarios",
        operationId: "listScenarios",
        responses: { "200": { description: "Scenario metadata" } }
      },
      post: {
        tags: ["sandbox"],
        summary: "Run an alignment scenario",
        operationId: "runScenario",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["scenarioId"],
                properties: {
                  scenarioId: { type: "string" },
                  seed: { type: "integer", default: 60602 }
                }
              }
            }
          }
        },
        responses: { "200": { description: "A scenario run" } }
      }
    },
    "/api/v1/ethics": {
      post: {
        tags: ["ethics"],
        summary: "Analyse an AI ethics case",
        operationId: "analyseEthics",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["caseId"],
                properties: { caseId: { type: "string" } }
              }
            }
          }
        },
        responses: { "200": { description: "The ethical analysis with argument graph" } }
      }
    },
    "/api/v1/debate": {
      post: {
        tags: ["debate"],
        summary: "Run a deterministic interpreter/skeptic/red-team debate",
        operationId: "debate",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["claim"],
                properties: { claim: { type: "string" }, seed: { type: "integer" } }
              }
            }
          }
        },
        responses: { "200": { description: "The argument transcript and verdict" } }
      }
    },
    "/api/v1/stream": {
      get: {
        tags: ["interpret"],
        summary: "Server-sent events stream of deterministic simulation ticks",
        operationId: "stream",
        responses: { "200": { description: "text/event-stream" } }
      }
    }
  },
  components: {
    schemas: {
      Health: {
        type: "object",
        required: ["status", "service", "version"],
        properties: {
          status: { type: "string" },
          service: { type: "string" },
          version: { type: "string" },
          time: { type: "string", format: "date-time" }
        }
      },
      InterpretResult: {
        type: "object",
        properties: {
          model: { type: "string" },
          config: { type: "object", additionalProperties: true },
          tokens: { type: "array", items: { type: "integer" } },
          predicted: { type: "array", items: { type: "integer" } },
          layers: { type: "integer" },
          heads: { type: "integer" },
          durationMs: { type: "number" }
        }
      },
      HeadProfile: {
        type: "object",
        properties: {
          layer: { type: "integer" },
          head: { type: "integer" },
          prevTokenScore: { type: "number" },
          focus: { type: "number" },
          entropy: { type: "number" },
          firstTokenScore: { type: "number" },
          role: { type: "string" }
        }
      },
      CorpusSearchResult: {
        type: "object",
        properties: {
          query: { type: "string" },
          total: { type: "integer" },
          entries: { type: "array", items: { type: "object", additionalProperties: true } },
          facets: {
            type: "array",
            items: {
              type: "object",
              properties: { tag: { type: "string" }, label: { type: "string" }, count: { type: "integer" } }
            }
          }
        }
      }
    },
    responses: {
      Unprocessable: {
        description: "The request body failed validation",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                    details: { type: "array", items: { type: "object", additionalProperties: true } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
} as const;

export default OPENAPI;
