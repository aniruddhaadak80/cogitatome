import { formatNumber } from "../../lib/palette";
import { Heatmap } from "../charts/heatmap";

export interface ActivationHeatmapProps {
  /** `activations[neuron][position]` — one row per neuron, one cell per token. */
  activations: readonly (readonly number[])[];
  /** Token labels for the columns. */
  positions: readonly string[];
  title: string;
  description?: string;
  /** Show at most this many neurons. Defaults to all of them. */
  neuronLimit?: number;
  /** Optional neuron names. Falls back to `n{index}`. */
  neuronLabels?: readonly string[];
  /** Colour-scale domain. Defaults to the data extent. */
  max?: number;
  cellSize?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

/**
 * MLP neuron activations across the sequence.
 *
 * Neurons are rows and token positions are columns, so a feature that fires on
 * a specific token shows up as a single bright cell, and a positional neuron
 * lights up a whole column.
 */
export function ActivationHeatmap({
  activations,
  positions,
  title,
  description,
  neuronLimit,
  neuronLabels,
  max,
  cellSize = 18,
  formatValue = (value) => formatNumber(value, 3),
  className
}: ActivationHeatmapProps) {
  const rows = neuronLimit !== undefined ? activations.slice(0, Math.max(0, neuronLimit)) : activations;
  const labels = rows.map((_, index) => neuronLabels?.[index] ?? `n${index}`);

  return (
    <Heatmap
      rows={labels}
      columns={[...positions]}
      values={rows}
      title={title}
      description={description}
      max={max}
      cellSize={cellSize}
      formatValue={formatValue}
      labelWidth={72}
      className={className}
    />
  );
}
