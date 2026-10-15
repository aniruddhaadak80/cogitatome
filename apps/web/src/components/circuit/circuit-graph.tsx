import type { CircuitGraph as CircuitGraphModel } from "@repo/core";

/**
 * A layered rendering of the circuit graph. Nodes are placed in columns by kind
 * and edges are bezier curves whose stroke width encodes the edge weight, so a
 * strong path reads as a thick line at a glance.
 */
export function CircuitGraph({ graph }: { graph: CircuitGraphModel }) {
  const columns: Record<string, (typeof graph.nodes)[number][]> = {};
  for (const node of graph.nodes) {
    const existing = columns[node.kind];
    if (existing) {
      existing.push(node);
    } else {
      columns[node.kind] = [node];
    }
  }

  const kinds = Object.keys(columns);
  const columnWidth = 190;
  const rowHeight = 34;
  const height = Math.max(
    200,
    ...kinds.map((k) => (columns[k]?.length ?? 0) * rowHeight + 40)
  );
  const width = kinds.length * columnWidth;

  const positions = new Map<string, { x: number; y: number }>();
  kinds.forEach((kind, colIndex) => {
    const nodes = columns[kind] ?? [];
    const startY = (height - nodes.length * rowHeight) / 2 + rowHeight / 2;
    nodes.forEach((node, rowIndex) => {
      positions.set(node.id, { x: colIndex * columnWidth + 95, y: startY + rowIndex * rowHeight });
    });
  });

  const kindColor: Record<string, string> = {
    token: "#8b93b0",
    embed: "#8b93b0",
    head: "#ffb347",
    mlp: "#a78bfa",
    residual: "#5ef1ff",
    feature: "#b8f56b",
    logit: "#5ef1ff"
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`Circuit graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges`}
    >
      <title>{`${graph.nodes.length} nodes, ${graph.edges.length} edges, target token ${graph.targetToken}`}</title>
      {graph.edges.map((edge, i) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return null;
        const weight = Math.abs(edge.weight);
        return (
          <path
            key={`${edge.from}-${edge.to}-${i}`}
            d={bezier(from, to)}
            fill="none"
            stroke="#5ef1ff"
            strokeOpacity={0.15 + Math.min(0.75, weight)}
            strokeWidth={0.75 + Math.min(4, weight * 5)}
          />
        );
      })}
      {graph.nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const color = kindColor[node.kind] ?? "#8b93b0";
        return (
          <g key={node.id}>
            <rect
              x={pos.x - 58}
              y={pos.y - 11}
              width={116}
              height={22}
              rx={4}
              fill="#0b1130"
              stroke={color}
              strokeOpacity={0.5}
            />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="#f4f6fb">
              {truncate(node.label, 18)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function bezier(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
