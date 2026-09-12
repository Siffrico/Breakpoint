import { describe, expect, it } from "vitest";

import type { MisconceptionState } from "./misconceptions";
import { reduceMisconceptions, selectRepairTarget } from "./misconceptions";

const day = (n: number) => new Date(`2026-03-0${n}T00:00:00Z`);

const active = (
  overrides: Partial<MisconceptionState> = {},
): MisconceptionState => ({
  code: "constraint-blindness",
  status: "active",
  occurrences: 2,
  lastSeenAt: day(1),
  ...overrides,
});

describe("reduceMisconceptions", () => {
  it("records a code the learner has not shown before", () => {
    expect(
      reduceMisconceptions([], {
        errorCodes: ["constraint-blindness"],
        cleanPass: false,
        occurredAt: day(2),
      }),
    ).toEqual([
      {
        code: "constraint-blindness",
        status: "active",
        occurrences: 1,
        lastSeenAt: day(2),
      },
    ]);
  });

  it("reactivates a code that comes back after remediation", () => {
    const [state] = reduceMisconceptions([active({ status: "addressed" })], {
      errorCodes: ["constraint-blindness"],
      cleanPass: false,
      occurredAt: day(2),
    });

    expect(state).toMatchObject({ status: "active", occurrences: 3 });
  });

  it("takes two clean passes on targeted scenarios to resolve", () => {
    const once = reduceMisconceptions([active()], {
      errorCodes: [],
      targetedCode: "constraint-blindness",
      cleanPass: true,
      occurredAt: day(2),
    });
    expect(once[0]).toMatchObject({ status: "addressed" });

    const twice = reduceMisconceptions(once, {
      errorCodes: [],
      targetedCode: "constraint-blindness",
      cleanPass: true,
      occurredAt: day(3),
    });
    expect(twice[0]).toMatchObject({ status: "resolved" });
  });

  it("refutes a guess when the targeted scenario fails for another reason", () => {
    const next = reduceMisconceptions([active()], {
      errorCodes: ["scope-creep"],
      targetedCode: "constraint-blindness",
      cleanPass: false,
      occurredAt: day(2),
    });

    expect(next).toMatchObject([
      { code: "constraint-blindness", status: "refuted", occurrences: 2 },
      { code: "scope-creep", status: "active", occurrences: 1 },
    ]);
    expect(selectRepairTarget(next)?.code).toBe("scope-creep");
  });

  it("leaves a refuted guess out of repair targeting", () => {
    expect(selectRepairTarget([active({ status: "refuted" })])).toBeNull();
  });
});
