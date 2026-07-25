import type { Metadata } from "next";

import { CoursesPage } from "~/features/courses/components/courses-page";

export const metadata: Metadata = {
  title: "Courses preview",
  description: "Preview the Breakpoint courses screen.",
};

export default function CoursesPreviewPage() {
  return <CoursesPage />;
}
