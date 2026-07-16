import {
  ContributionGraph,
  ContributionGraphBlock,
  ContributionGraphCalendar,
  ContributionGraphFooter,
  ContributionGraphLegend,
  ContributionGraphTotalCount,
} from "~/components/kibo-ui/contribution-graph";
import { SettingsSection } from "~/features/settings/components/settings-shell";
import { buildUnitActivityCalendar } from "~/features/settings/lib/learning-activity";

export function LearningActivityCard({
  activity,
}: {
  activity: { date: string; count: number }[];
}) {
  const calendar = buildUnitActivityCalendar(activity);
  const total = activity.reduce((sum, day) => sum + day.count, 0);

  return (
    <SettingsSection title="Learning activity" radius="lg">
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-5">
          <h2 className="text-foreground text-[13px] font-medium">
            Units completed
          </h2>
          <div className="text-right">
            <div className="text-foreground text-[18px] font-semibold tabular-nums">
              {total}
            </div>
            <div className="text-foreground/44 text-[11px]">past year</div>
          </div>
        </div>

        <ContributionGraph
          data={calendar}
          blockSize={10}
          blockMargin={2}
          blockRadius={2}
          fontSize={10}
          totalCount={total}
          className="text-foreground/44 mt-3 w-full"
          labels={{
            totalCount: "{{count}} units completed in the past year",
            legend: { less: "Quiet", more: "Focused" },
          }}
        >
          <ContributionGraphCalendar aria-label="Unit completion activity over the past year">
            {(block) => (
              <ContributionGraphBlock
                {...block}
                aria-label={`${block.activity.date}: ${block.activity.count} ${block.activity.count === 1 ? "unit" : "units"} completed`}
                className="stroke-border/40 data-[level=0]:fill-foreground/[0.05] stroke-[0.5px] transition-colors data-[level=1]:fill-blue-300/55 data-[level=2]:fill-blue-400/70 data-[level=3]:fill-blue-500/85 data-[level=4]:fill-blue-500"
              />
            )}
          </ContributionGraphCalendar>
          <ContributionGraphFooter className="mt-1 items-center text-[10px]">
            <ContributionGraphTotalCount>
              {() => (
                <span className="text-foreground/44">
                  {total === 0
                    ? "Complete your first unit to begin the map."
                    : `${total} ${total === 1 ? "unit" : "units"} completed`}
                </span>
              )}
            </ContributionGraphTotalCount>
            <ContributionGraphLegend>
              {({ level }) => (
                <span
                  aria-hidden="true"
                  className="border-border/40 data-[level=0]:bg-foreground/[0.05] size-[10px] rounded-[2px] border data-[level=1]:bg-blue-300/55 data-[level=2]:bg-blue-400/70 data-[level=3]:bg-blue-500/85 data-[level=4]:bg-blue-500"
                  data-level={level}
                />
              )}
            </ContributionGraphLegend>
          </ContributionGraphFooter>
        </ContributionGraph>
      </div>
    </SettingsSection>
  );
}
