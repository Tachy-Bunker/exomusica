import type { Branch } from "./types";

export interface LaidOutBranch extends Branch {
  x: number;
  y: number;
  depth: number;
}

export function layoutTree(
  branches: Branch[],
  centerX: number,
  centerY: number,
  coreRadius: number,
  ringSpacing: number,
): LaidOutBranch[] {
  const byParent = new Map<number | null, Branch[]>();
  for (const b of branches) {
    const key = b.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(b);
  }

  const result: LaidOutBranch[] = [];

  function place(nodes: Branch[], depth: number, angleStart: number, angleEnd: number) {
    const step = (angleEnd - angleStart) / nodes.length;
    nodes.forEach((node, i) => {
      const angle = angleStart + step * (i + 0.5);
      const radius = coreRadius + ringSpacing * depth;
      const x = node.posX ?? centerX + radius * Math.cos(angle);
      const y = node.posY ?? centerY + radius * Math.sin(angle);
      result.push({ ...node, x, y, depth });
      const children = byParent.get(node.id) ?? [];
      if (children.length > 0) place(children, depth + 1, angleStart + step * i, angleStart + step * (i + 1));
    });
  }

  place(byParent.get(null) ?? [], 1, 0, Math.PI * 2);
  return result;
}
