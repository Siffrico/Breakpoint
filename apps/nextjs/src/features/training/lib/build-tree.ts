import type { RouterOutputs } from "@acme/api";
import type { TreeNode } from "@acme/ui/tree";

type PlanNodes = RouterOutputs["training"]["activePlan"]["nodes"];

export function buildTree(
  nodes: PlanNodes,
): TreeNode[] {
  const childrenMap = new Map<string | null, PlanNodes>();

  for (const node of nodes) {
    const parentId = node.parentNodeId;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    const siblings = childrenMap.get(parentId);
    if (siblings) {
      siblings.push(node);
    }
  }

  function convert(node: PlanNodes[number]): TreeNode {
    const children = childrenMap.get(node.id) ?? [];
    return {
      id: node.id,
      label: node.title,
      variant: "default",
      status: node.status as TreeNode["status"],
      children:
        children.length > 0
          ? children.sort((a, b) => a.orderIndex - b.orderIndex).map(convert)
          : undefined,
    };
  }

  const roots = childrenMap.get(null) ?? [];
  return roots.sort((a, b) => a.orderIndex - b.orderIndex).map(convert);
}
