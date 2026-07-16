import type {
  ProfileAccount,
  ProfileBilling,
  ProfileGeneral,
} from "@acme/validators";

export const previewProfileGeneral: ProfileGeneral = {
  sessionId: "00000000-0000-0000-0000-000000000000",
  targetIdentity: "Staff backend engineer",
  motivation:
    "Ship ambiguous infra work end-to-end without waiting for someone else to de-risk it.",
  hardMoments: [
    "Scoping work when requirements are fuzzy",
    "Holding a tradeoff call under deadline pressure",
  ],
  unitActivity: [
    { date: "2026-05-12", count: 1 },
    { date: "2026-05-14", count: 2 },
    { date: "2026-05-19", count: 1 },
    { date: "2026-05-20", count: 3 },
  ],
};

export const previewProfileAccount: ProfileAccount = {
  name: "Safin Ahmed",
  email: "safin@breakpoint.dev",
  provider: "discord",
  image: null,
};

export const previewProfileBilling: ProfileBilling = {
  plan: "free",
  manageUrl: null,
};

export const previewLearningProjects = [
  {
    sessionId: "00000000-0000-0000-0000-000000000000",
    title: "Staff backend engineer",
    headline: "Operate clearly inside ambiguous infrastructure decisions.",
    status: "active",
    lessonPreview: [
      {
        id: "unit-1",
        title: "Tradeoff framing under uncertainty",
        status: "ready",
      },
    ],
    updatedAt: new Date("2026-05-20T10:00:00Z"),
  },
  {
    sessionId: "11111111-1111-1111-1111-111111111111",
    title: "Financial independence operator",
    headline: "Build repeatable money systems without reactive decisions.",
    status: "onboarding",
    lessonPreview: [],
    updatedAt: new Date("2026-05-18T10:00:00Z"),
  },
];

export const previewMemories = [
  {
    id: "mem-1",
    content:
      "Prefers async-first workflows with written decisions over meetings.",
    source: "manual" as const,
    importId: null,
    createdAt: new Date("2026-03-28T10:00:00Z"),
    updatedAt: null,
  },
  {
    id: "mem-2",
    content:
      "Has shipped three distributed systems; comfortable with consensus tradeoffs but less confident on on-call judgment.",
    source: "chatgpt_import" as const,
    importId: "imp-1",
    createdAt: new Date("2026-03-30T10:00:00Z"),
    updatedAt: null,
  },
  {
    id: "mem-3",
    content:
      "Freezes on ambiguous product asks; wants training under deadline pressure.",
    source: "chatgpt_import" as const,
    importId: "imp-1",
    createdAt: new Date("2026-04-01T10:00:00Z"),
    updatedAt: null,
  },
];
