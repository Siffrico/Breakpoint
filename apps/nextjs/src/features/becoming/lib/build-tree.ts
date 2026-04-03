import type { RouterOutputs } from "@acme/api";
import type { TreeNode } from "@acme/ui/tree";

type PlanNodes = RouterOutputs["becoming"]["activePlan"]["nodes"];

export function buildTree(
  nodes: PlanNodes,
  nodeScores?: Record<string, number>,
): TreeNode[] {
  const childrenMap = new Map<string | null, PlanNodes>();

  for (const node of nodes) {
    const parentId = node.parentNodeId;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(node);
  }

  function convert(node: PlanNodes[number]): TreeNode {
    const children = childrenMap.get(node.id) ?? [];
    const score = nodeScores?.[node.id];
    const label =
      score != null && node.status === "completed"
        ? `${node.title} · ${score}`
        : node.title;

    return {
      id: node.id,
      label,
      variant: node.kind === "simulation" ? "simulation" : "default",
      status: node.status as TreeNode["status"],
      children:
        children.length > 0
          ? children
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map(convert)
          : undefined,
    };
  }

  const roots = childrenMap.get(null) ?? [];
  return roots.sort((a, b) => a.orderIndex - b.orderIndex).map(convert);
}
