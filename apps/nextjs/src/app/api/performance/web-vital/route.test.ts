import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  recordWebVitalPerformance: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@acme/api/performance", () => ({
  recordWebVitalPerformance: mocks.recordWebVitalPerformance,
}));
vi.mock("~/app/api/_lib/require-session", () => ({
  requireSession: mocks.requireSession,
}));
vi.mock("@acme/db/client", () => ({ db: {} }));

const validMetric = {
  route: "/workspace",
  name: "INP",
  value: 124,
  delta: 20,
  rating: "good",
  navigationType: "navigate",
};

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/performance/web-vital", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("web vital route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.recordWebVitalPerformance.mockResolvedValue(undefined);
  });

  it("records a validated metric for an authenticated learner", async () => {
    const response = await POST(request(validMetric));

    expect(response.status).toBe(204);
    expect(mocks.recordWebVitalPerformance).toHaveBeenCalledWith(
      expect.anything(),
      validMetric,
    );
  });

  it("rejects anonymous reports", async () => {
    mocks.requireSession.mockResolvedValue(null);

    const response = await POST(request(validMetric));

    expect(response.status).toBe(401);
    expect(mocks.recordWebVitalPerformance).not.toHaveBeenCalled();
  });

  it("rejects unknown metrics and external route values", async () => {
    const response = await POST(
      request({ ...validMetric, name: "CUSTOM", route: "https://example.com" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.recordWebVitalPerformance).not.toHaveBeenCalled();
  });
});
