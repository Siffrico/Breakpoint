import Link from "next/link";

import { DomainSelection } from "~/features/esde/components/domain-selection";
import { ScenarioWorkspace } from "~/features/esde/components/scenario-workspace";
import {
  previewDomainCatalog,
  previewScenario,
} from "~/features/esde/lib/esde-preview";

export default function UiPreviewDomainsPage() {
  return (
    <div className="bg-[#06070a]">
      <DomainSelection domains={previewDomainCatalog} preview />

      <div className="border-t border-white/10 bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 border border-white/10 bg-white/[0.03] px-5 py-4">
          <div>
            <p className="text-xs tracking-[0.26em] uppercase text-white/35">
              Embedded Preview
            </p>
            <p className="mt-2 text-sm text-white/60">
              Open the mock scenario below or jump back to the preview hub.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/ui" className="text-sm text-white/75 hover:text-white">
              UI hub
            </Link>
            <Link href="#scenario-preview" className="text-sm text-white/75 hover:text-white">
              Scenario
            </Link>
          </div>
        </div>
      </div>

      <div id="scenario-preview">
        <ScenarioWorkspace scenario={previewScenario} preview />
      </div>
    </div>
  );
}
