import type { EsdeStage } from "../types/esde-simulation.types";

export interface ScenarioSeed {
  id: string;
  variantKey: string;
  variantOrder: number;
  title: string;
  narrative: string;
  focusAreas: string[];
  successCriteria: string[];
  pressureModifiers: string[];
  stageSequence: EsdeStage[];
  responseMode: "typed";
}

export interface LevelSeed {
  slug: string;
  title: string;
  description: string;
  levelNumber: number;
  unlockOrder: number;
  scenarios: ScenarioSeed[];
}

export interface DomainSeed {
  slug: string;
  title: string;
  description: string;
  unlockOrder: number;
  levels: LevelSeed[];
}

export const esdeCatalog: DomainSeed[] = [
  {
    slug: "software-engineering",
    title: "Software Engineering",
    description:
      "Practice realistic systems thinking, debugging, architecture, and prioritization under pressure.",
    unlockOrder: 1,
    levels: [
      {
        slug: "software-engineering-level-1",
        title: "Queue Failure Containment",
        description:
          "Diagnose system failures quickly, contain blast radius, and verify the system is stable.",
        levelNumber: 1,
        unlockOrder: 1,
        scenarios: [
          {
            id: "se-level-1-scenario-001",
            variantKey: "baseline",
            variantOrder: 1,
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
            pressureModifiers: ["Timer", "Live billing impact"],
            stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
            responseMode: "typed",
          },
          {
            id: "se-level-1-scenario-002",
            variantKey: "retry-degraded-observability",
            variantOrder: 2,
            title: "Retry Variant: Billing Backlog with Missing Dashboards",
            narrative:
              "The invoice duplication incident is still active, but now the primary queue dashboard is stale and support is escalating charge complaints. Agent A continues ingesting events, Agent B is retrying failed dedupe checks, and finance wants an answer in 5 minutes. What failure path do you believe is occurring, how do you contain the system without full observability, and what long-term design change makes this class of failure harder to repeat?",
            focusAreas: [
              "Operating under incomplete information",
              "Containment",
              "Fallback observability",
              "Durable design",
            ],
            successCriteria: [
              "Infer the failure path from partial data.",
              "Name a blast-radius reduction step.",
              "Describe fallback verification signals.",
              "Propose an idempotent architecture.",
            ],
            pressureModifiers: [
              "Incomplete information",
              "Hostile stakeholder pressure",
            ],
            stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
            responseMode: "typed",
          },
        ],
      },
      {
        slug: "software-engineering-level-2",
        title: "Pipeline Poisoning and Safe Recovery",
        description:
          "Find poisoned inputs, explain safeguard failures, and design recovery patterns for AI data pipelines.",
        levelNumber: 2,
        unlockOrder: 2,
        scenarios: [
          {
            id: "se-level-2-scenario-001",
            variantKey: "baseline",
            variantOrder: 1,
            title: "Safety Incident: Poisoned Medical Summary Pipeline",
            narrative:
              "Your medical synthesis pipeline generated a dangerous dosage recommendation after ingesting a malformed OCR batch. The OCR agent has a 9% failure rate, the synthesis agent fine-tunes nightly, and the validation service only checks schema shape, not semantic drift. Explain where the pipeline likely failed, what you shut down first, how you verify contamination scope, and what architecture prevents re-poisoning.",
            focusAreas: [
              "Forensic debugging",
              "Safety containment",
              "Data validation",
              "Recovery architecture",
            ],
            successCriteria: [
              "Identify a likely poisoning path.",
              "Contain the unsafe recommendation path immediately.",
              "Define how to measure contamination scope.",
              "Propose stronger validation and rollout controls.",
            ],
            pressureModifiers: ["Changing constraints", "Safety-critical impact"],
            stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
            responseMode: "typed",
          },
          {
            id: "se-level-2-scenario-002",
            variantKey: "retry-regulatory-pressure",
            variantOrder: 2,
            title: "Retry Variant: Silent Drift Under Compliance Pressure",
            narrative:
              "The dangerous dosage recommendation was caught externally, regulators have requested an incident timeline, and your semantic validation job has been flaky for 3 days. You need to explain the most likely contamination chain, state what gets disabled immediately, define a verification plan, and design a safer release process that still allows model improvement.",
            focusAreas: [
              "Incident communication",
              "Regulated-system safeguards",
              "Verification rigor",
              "Rollout design",
            ],
            successCriteria: [
              "Map the likely contamination chain.",
              "Name the immediate disable or rollback action.",
              "Explain a verification plan with explicit signals.",
              "Propose a staged release process with guardrails.",
            ],
            pressureModifiers: ["Conflicting incentives", "Regulatory pressure"],
            stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
            responseMode: "typed",
          },
        ],
      },
    ],
  },
  {
    slug: "product",
    title: "Product",
    description:
      "Prioritization, product sense, tradeoff reasoning, and roadmap judgment.",
    unlockOrder: 2,
    levels: [
      {
        slug: "product-level-1",
        title: "Signal Extraction and Prioritization",
        description:
          "Separate noise from signal and make defensible prioritization calls with incomplete evidence.",
        levelNumber: 1,
        unlockOrder: 1,
        scenarios: [
          {
            id: "product-level-1-scenario-001",
            variantKey: "baseline",
            variantOrder: 1,
            title: "Escalation Storm: Five Teams Want the Roadmap",
            narrative:
              "Five internal teams claim their feature is urgent, churn is up 3%, onboarding conversion is down 8%, and engineering can only ship one meaningful initiative this cycle. Explain how you diagnose the real problem, what you prioritize first, how you validate the decision, and what you tell the losing stakeholders.",
            focusAreas: [
              "Prioritization",
              "Reasoning under ambiguity",
              "Stakeholder management",
              "Validation planning",
            ],
            successCriteria: [
              "Name the decision framework.",
              "Choose the first initiative and justify it.",
              "Describe validation metrics.",
              "Explain how to communicate tradeoffs.",
            ],
            pressureModifiers: ["Conflicting incentives", "Incomplete information"],
            stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
            responseMode: "typed",
          },
        ],
      },
    ],
  },
  {
    slug: "leadership",
    title: "Leadership",
    description:
      "Decision-making, conflict navigation, clarity under pressure, and communication.",
    unlockOrder: 3,
    levels: [
      {
        slug: "leadership-level-1",
        title: "High-Pressure Decision Clarity",
        description:
          "Make the call, explain the tradeoffs, and align a team under pressure.",
        levelNumber: 1,
        unlockOrder: 1,
        scenarios: [
          {
            id: "leadership-level-1-scenario-001",
            variantKey: "baseline",
            variantOrder: 1,
            title: "Critical Launch Conflict",
            narrative:
              "A launch is 48 hours away. Engineering wants a delay for reliability, sales wants the date held for pipeline reasons, and the CEO wants confidence in front of the board. Explain how you diagnose the situation, what decision you make first, how you align the room, and what operating change prevents this failure pattern next quarter.",
            focusAreas: [
              "Decision quality",
              "Conflict navigation",
              "Communication under pressure",
              "Operational improvement",
            ],
            successCriteria: [
              "Clarify the governing decision.",
              "State the call and why.",
              "Explain the communication plan.",
              "Propose a structural process improvement.",
            ],
            pressureModifiers: ["Hostile counterpart", "Changing constraints"],
            stageSequence: ["educate", "simulate", "diagnose", "evaluate"],
            responseMode: "typed",
          },
        ],
      },
    ],
  },
];
