import { redirect } from "next/navigation";

export default function LegacyUiHomePage() {
  redirect("/ui/workspace");
}
