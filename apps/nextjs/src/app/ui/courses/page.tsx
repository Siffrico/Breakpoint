import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Courses preview",
  description: "Preview the Breakpoint courses screen.",
};

import { CoursesPage } from "~/features/courses/components/courses-page";

export default function CoursesPreviewPage() {
  return <CoursesPage />;
}
