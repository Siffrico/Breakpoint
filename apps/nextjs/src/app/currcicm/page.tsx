import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import type { RouterOutputs } from "@acme/api";

import { getSession } from "~/auth/server";
import {
  getActivePlan,
  listLearningProjects,
} from "~/features/training/server/training-queries";

export const metadata: Metadata = {
  title: "Currcicm",
  description: "Review the saved Breakpoint curriculum plan.",
};

const LAST_SESSION_COOKIE = "bp-last-learning-session";

type Plan = RouterOutputs["training"]["activePlan"];
type PlanNode = Plan["nodes"][number];

type TreeNode = PlanNode & {
  children: TreeNode[];
};

const statusLabel: Record<PlanNode["status"], string> = {
  completed: "Complete",
  planned: "Planned",
  ready: "Ready",
};

const kindLabel: Record<PlanNode["kind"], string> = {
  ability: "Ability",
  root: "Path",
  skill: "Skill",
  unit: "Unit",
};

function buildCurriculumTree(nodes: Plan["nodes"]): TreeNode[] {
  const childrenByParent = new Map<string | null, PlanNode[]>();

  for (const node of nodes) {
    const parentId = node.parentNodeId;
    childrenByParent.set(parentId, [
      ...(childrenByParent.get(parentId) ?? []),
      node,
    ]);
  }

  const convert = (node: PlanNode): TreeNode => ({
    ...node,
    children: (childrenByParent.get(node.id) ?? [])
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map(convert),
  });

  return (childrenByParent.get(null) ?? [])
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map(convert);
}

function StatusBadge({ status }: { status: PlanNode["status"] }) {
  const className =
    status === "ready"
      ? "border-[#5da7ff]/40 bg-[#5da7ff]/10 text-[#b9dcff]"
      : status === "completed"
        ? "border-white/15 bg-white/[0.07] text-white/72"
        : "border-white/10 bg-white/[0.03] text-white/48";

  return (
    <span
      className={[
        "inline-flex h-6 items-center border px-2 font-mono text-[10px] tracking-[0.14em] uppercase",
        className,
      ].join(" ")}
    >
      {statusLabel[status]}
    </span>
  );
}

function PlanNodeRow({ node }: { node: TreeNode }) {
  const isRoot = node.kind === "root";

  return (
    <li className="relative pl-5">
      <div
        className={[
          "absolute top-0 bottom-0 left-[5px] w-px",
          isRoot ? "bg-white/12" : "bg-white/8",
        ].join(" ")}
      />
      <div className="absolute top-5 left-0 size-[11px] border border-white/18 bg-[#08090d]" />

      <div className="border-b border-white/10 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-[0.18em] text-white/36 uppercase">
              {kindLabel[node.kind]}
            </div>
            <h2 className="font-display mt-2 text-[18px] leading-tight tracking-[-0.02em] text-white">
              {node.title}
            </h2>
          </div>
          <StatusBadge status={node.status} />
        </div>

        <p className="mt-3 max-w-2xl text-[13px] leading-6 text-white/58">
          {node.summary}
        </p>

        <div className="mt-4 border-l border-[#5da7ff]/28 pl-4">
          <div className="font-mono text-[10px] tracking-[0.16em] text-[#9acbff]/70 uppercase">
            Why it matters
          </div>
          <p className="mt-2 text-[13px] leading-6 text-white/66">
            {node.whyItMatters}
          </p>
        </div>
      </div>

      {node.children.length > 0 ? (
        <ol className="ml-3">
          {node.children.map((child) => (
            <PlanNodeRow key={child.id} node={child} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function PlanSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
      <div className="h-6 w-28 bg-white/8" />
      <div className="mt-5 h-12 max-w-xl bg-white/8" />
      <div className="mt-5 h-16 max-w-2xl bg-white/[0.06]" />
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <div className="h-24 border border-white/10 bg-white/[0.04]" />
        <div className="h-24 border border-white/10 bg-white/[0.04]" />
        <div className="h-24 border border-white/10 bg-white/[0.04]" />
      </div>
      <div className="mt-10 h-80 border border-white/10 bg-white/[0.035]" />
    </div>
  );
}

async function SavedCurriculumPlan() {
  const [authSession, cookieStore] = await Promise.all([
    getSession(),
    cookies(),
  ]);

  if (!authSession?.user) {
    redirect("/");
  }

  const projects = await listLearningProjects().catch(() => []);
  const cookieSessionId = cookieStore.get(LAST_SESSION_COOKIE)?.value;
  const resolvedSessionId = cookieSessionId ?? projects[0]?.sessionId ?? null;

  if (!resolvedSessionId) {
    redirect("/onboarding");
  }

  const plan = await getActivePlan(resolvedSessionId).catch(() => null);

  if (!plan) {
    redirect("/workspace");
  }

  const tree = buildCurriculumTree(plan.nodes);
  const trainableNodes = plan.nodes.filter((node) => node.kind === "unit");
  const completedNodes = trainableNodes.filter(
    (node) => node.status === "completed",
  );
  const readyNode = plan.nextUnitId
    ? plan.nodes.find((node) => node.id === plan.nextUnitId)
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
      <header className="border-b border-white/10 pb-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="font-mono text-[11px] tracking-[0.2em] text-[#9acbff]/72 uppercase">
              Becoming curriculum plan
            </div>
            <h1 className="font-display mt-4 text-[34px] leading-[1.05] tracking-[-0.035em] text-white sm:text-[48px]">
              {plan.title}
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-white/62">
              {plan.summary}
            </p>
          </div>

          <Link
            href="/workspace"
            className="inline-flex h-10 items-center justify-center border border-[#5da7ff]/55 bg-[#1f7fff] px-4 text-[13px] font-medium text-white shadow-[0_18px_60px_rgba(31,127,255,0.22)] transition-colors hover:bg-[#2d8cff]"
          >
            Continue training
          </Link>
        </div>
      </header>

      <section className="grid border-b border-white/10 sm:grid-cols-3">
        <div className="border-white/10 py-5 sm:border-r sm:pr-6">
          <div className="font-mono text-[10px] tracking-[0.16em] text-white/36 uppercase">
            Target
          </div>
          <div className="mt-2 text-[14px] leading-6 text-white/76">
            {plan.targetIdentity}
          </div>
        </div>
        <div className="border-t border-white/10 py-5 sm:border-t-0 sm:border-r sm:px-6">
          <div className="font-mono text-[10px] tracking-[0.16em] text-white/36 uppercase">
            Progress
          </div>
          <div className="mt-2 text-[14px] leading-6 text-white/76">
            {completedNodes.length} of {trainableNodes.length} units complete
          </div>
        </div>
        <div className="border-t border-white/10 py-5 sm:border-t-0 sm:pl-6">
          <div className="font-mono text-[10px] tracking-[0.16em] text-white/36 uppercase">
            Next
          </div>
          <div className="mt-2 text-[14px] leading-6 text-white/76">
            {readyNode?.title ?? "No active unit"}
          </div>
        </div>
      </section>

      <section className="grid gap-8 py-8">
        <ol className="border-t border-white/10">
          {tree.map((node) => (
            <PlanNodeRow key={node.id} node={node} />
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function CurrcicmPage() {
  return (
    <main className="min-h-dvh bg-[#08090d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(62,139,255,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_26%)]" />
      <div className="relative">
        <Suspense fallback={<PlanSkeleton />}>
          <SavedCurriculumPlan />
        </Suspense>
      </div>
    </main>
  );
}
