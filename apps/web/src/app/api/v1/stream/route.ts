import { z } from "zod";
import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet,
  makeRepeated,
  randomWeights
} from "@repo/core";

/**
 * `/api/v1/stream` — the same forward pass as `/api/v1/interpret`, delivered as
 * Server-Sent Events, one frame per token prefix.
 *
 * Each frame carries the prediction at that prefix, whether it continued the
 * motif, and the running induction accuracy — so a dashboard can animate the
 * model "learning" the repetition in real time. The stream is deterministic:
 * the same query always yields the same frames in the same order. It ends with
 * a `summary` event, then closes.
 */
const querySchema = z.object({
  model: z.enum(["induction", "random"]).default("induction"),
  tokens: z.string().max(300).optional()
});

export const dynamic = "force-dynamic";

function argMax(row: ArrayLike<number>): number {
  let best = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < row.length; i += 1) {
    if ((row[i] ?? 0) > bestValue) {
      bestValue = row[i] ?? 0;
      best = i;
    }
  }
  return best;
}

function frame(event: string, id: number, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const encoder = new TextEncoder();

  if (!parsed.success) {
    return new Response(frame("error", 0, { code: "invalid_request", message: "invalid parameters" }), {
      status: 422,
      headers: { "content-type": "text/event-stream; charset=utf-8" }
    });
  }

  const { tokens: tokenParam, model: modelId } = parsed.data;
  const tokens =
    tokenParam === undefined
      ? makeRepeated([1, 2, 3, 4], 6)
      : tokenParam
          .split(",")
          .map((t) => Number.parseInt(t.trim(), 10))
          .filter((t) => Number.isInteger(t) && t >= 0 && t <= 15);

  if (tokens.length === 0 || tokens.length > 32) {
    return new Response(
      frame("error", 0, { code: "invalid_request", message: "tokens must resolve to 1..32 ids in 0..15" }),
      { status: 422, headers: { "content-type": "text/event-stream; charset=utf-8" } }
    );
  }

  const model =
    modelId === "random"
      ? new CogitatomeModel(randomWeights())
      : new CogitatomeModel(constructInductionModel());

  const symbols = decodeAlphabet(tokens).split(" ");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let hits = 0;
      let learnable = 0;
      let id = 0;
      for (let prefix = 1; prefix < tokens.length; prefix += 1) {
        const slice = tokens.slice(0, prefix + 1);
        const trace = model.forward(slice);
        const predicted = argMax(trace.logits[prefix - 1] ?? []);
        const truth = tokens[prefix] ?? -1;
        const correct = predicted === truth;
        // Learnable once the current token has appeared before.
        const seen = slice.slice(0, prefix).includes(tokens[prefix] ?? -1);
        if (seen) {
          learnable += 1;
          if (correct) hits += 1;
        }
        id += 1;
        controller.enqueue(
          encoder.encode(
            frame("tick", id, {
              position: prefix,
              symbol: symbols[prefix] ?? "?",
              predicted,
              truth,
              correct,
              learnable: seen,
              runningAccuracy: learnable === 0 ? null : hits / learnable
            })
          )
        );
      }
      id += 1;
      controller.enqueue(
        encoder.encode(
          frame("summary", id, {
            model: modelId,
            tokens,
            learnableHits: hits,
            learnableTotal: learnable,
            learnableAccuracy: learnable === 0 ? 0 : hits / learnable
          })
        )
      );
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}
