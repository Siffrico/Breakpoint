"use client";

import { useReportWebVitals } from "next/web-vitals";

import type { RecordWebVital } from "@acme/validators";

const WEB_VITAL_SAMPLE_RATE = 0.1;
const reportThisPage = Math.random() < WEB_VITAL_SAMPLE_RATE;

export function WebVitalsReporter() {
  useReportWebVitals((metric: RecordWebVital) => {
    if (!reportThisPage) return;

    const body = JSON.stringify({
      route: window.location.pathname,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
    });
    navigator.sendBeacon(
      "/api/performance/web-vital",
      new Blob([body], { type: "application/json" }),
    );
  });

  return null;
}
