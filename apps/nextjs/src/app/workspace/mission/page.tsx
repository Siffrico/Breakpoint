import { redirect } from "next/navigation";
import { z } from "zod/v4";

import { getSession } from "~/auth/server";
import { MissionCanvas } from "~/features/training/components/mission/mission-canvas";
import { getMissionForUnitRun } from "~/features/training/server/mission-queries";

export default async function MissionPage({
  searchParams,
}: {
  searchParams: Promise<{ unitRunId?: string }>;
}) {
  const [{ unitRunId }, session] = await Promise.all([
    searchParams,
    getSession(),
  ]);
  if (!session?.user) redirect("/");
  if (!unitRunId || !z.string().uuid().safeParse(unitRunId).success)
    redirect("/workspace");
  const mission = await getMissionForUnitRun(unitRunId).catch(() => null);
  return (
    <MissionCanvas unitRunId={unitRunId} initialMission={mission ?? null} />
  );
}
