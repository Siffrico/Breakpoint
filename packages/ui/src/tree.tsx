"use client";

import * as React from "react";

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  variant?: "default" | "simulation";
  status?: "ready" | "completed" | "planned" | "locked";
}

function TreeBranch({
  node,
  defaultExpanded = true,
}: {
  node: TreeNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;

  if (!hasChildren) {
    return <TreeLeaf node={node} />;
  }

  const children = node.children ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-white/[0.03]"
      >
        <svg
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-display text-foreground">{node.label}</span>
      </button>
      {expanded && (
        <div className="ml-2 border-l border-border pl-3">
          {children.map((child) => (
            <TreeBranch key={child.id} node={child} defaultExpanded={defaultExpanded} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeLeaf({ node }: { node: TreeNode }) {
  const statusColor =
    node.status === "ready"
      ? "text-foreground"
      : node.status === "completed"
        ? "text-primary"
        : "text-muted-foreground";

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 text-sm ${statusColor}`}
    >
      <span className="h-3 w-3 shrink-0" />
      {node.variant === "simulation" ? (
        <span>
          <span className="mr-1.5 font-mono text-xs text-primary">SIM</span>
          {node.label}
        </span>
      ) : (
        <span>{node.label}</span>
      )}
    </div>
  );
}

function TreeView({
  nodes,
  defaultExpanded = true,
}: {
  nodes: TreeNode[];
  defaultExpanded?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <TreeBranch key={node.id} node={node} defaultExpanded={defaultExpanded} />
      ))}
    </div>
  );
}

export { TreeView, TreeBranch, TreeLeaf };
export type { TreeNode };
