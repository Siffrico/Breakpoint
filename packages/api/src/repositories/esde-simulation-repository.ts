import { err, ok, type Result } from "../lib/result";
import type {
  ActiveScenario,
  LearningDomainCard,
} from "../domain/esde-simulation/types/esde-simulation.types";

const learningDomains: LearningDomainCard[] = [
  {
    slug: "software-engineering",
    title: "Software Engineering",
    description:
      "Practice realistic systems thinking, debugging, architecture, and prioritization under pressure.",
    status: "available",
    stageLabel: "E.S.D.E. Level 1",
    difficultyLabel: "Live",
  },
  {
    slug: "sales",
    title: "Sales",
    description:
      "Objection handling, framing, discovery, and strategic diagnosis.",
    status: "locked",
    stageLabel: "Coming Soon",
    difficultyLabel: "Locked",
  },
  {
    slug: "product",
    title: "Product",
    description:
      "Prioritization, product sense, tradeoff reasoning, and roadmap judgment.",
    status: "locked",
    stageLabel: "Coming Soon",
    difficultyLabel: "Locked",
  },
  {
    slug: "design",
    title: "Design",
    description:
      "UX clarity, interface judgment, systems thinking, and critique.",
    status: "locked",
    stageLabel: "Coming Soon",
    difficultyLabel: "Locked",
  },
  {
    slug: "leadership",
    title: "Leadership",
    description:
      "Decision-making, conflict navigation, clarity under pressure, and communication.",
    status: "locked",
    stageLabel: "Coming Soon",
    difficultyLabel: "Locked",
  },
  {
    slug: "writing",
    title: "Writing",
    description:
      "Argument quality, persuasion, structure, and explanation under constraints.",
    status: "locked",
    stageLabel: "Coming Soon",
    difficultyLabel: "Locked",
  },
];

const activeScenarios: Record<string, ActiveScenario> = {
  "software-engineering": {
    id: "se-level-1-scenario-001",
    domainSlug: "software-engineering",
    domainTitle: "Software Engineering",
    activeStage: "simulate",
    stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
    responseMode: "typed",
    prompt: {
      title: "Production Incident: Duplicate Invoices and Queue Saturation",
      narrative:
        "You are on call for an AI-assisted invoicing platform. Agent A ingests 12,000 invoice events per minute. Agent B enriches and deduplicates them before billing. For the last 9 minutes, some customers are receiving duplicate invoices while the processing queue is backing up. Retries are still enabled, but idempotency is inconsistent across services. What is happening, what do you do first, and what architectural changes would you make to stop this from happening again?",
      focusAreas: [
        "Root-cause diagnosis",
        "Containment under pressure",
        "Prioritization",
        "Observability",
      ],
      successCriteria: [
        "Explain the likely system failure mode.",
        "Name the first containment step.",
        "Describe how to verify the fix.",
        "Propose a durable architectural improvement.",
      ],
    },
  },
};

export const esdeSimulationRepository = {
  listDomains: async (): Promise<Result<LearningDomainCard[]>> => {
    return ok(learningDomains);
  },

  getDomainBySlug: async (
    domainSlug: string,
  ): Promise<Result<LearningDomainCard>> => {
    const domain = learningDomains.find((entry) => entry.slug === domainSlug);

    if (!domain) {
      return err("The requested domain does not exist.");
    }

    return ok(domain);
  },

  getActiveScenarioByDomainSlug: async (
    domainSlug: string,
  ): Promise<Result<ActiveScenario>> => {
    const scenario = activeScenarios[domainSlug];

    if (!scenario) {
      return err("There is no active scenario configured for this domain yet.");
    }

    return ok(scenario);
  },
};
