import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse your Breakpoint courses.",
};

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { CoursesPage } from "~/features/courses/components/courses-page";

const LAST_SESSION_COOKIE = "bp-last-learning-session";

export default async function CoursesRoute() {
  const [authSession, cookieStore] = await Promise.all([
    getSession(),
    cookies(),
  ]);

  if (!authSession?.user) {
    redirect("/");
  }

  const sessionId = cookieStore.get(LAST_SESSION_COOKIE)?.value ?? undefined;

  return <CoursesPage sessionId={sessionId} />;
}
