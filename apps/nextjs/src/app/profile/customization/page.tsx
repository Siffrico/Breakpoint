import { MemoryPanel } from "~/features/profile/components/customization/memory-panel";
import { listMemories } from "~/features/profile/server/profile-queries";

export default async function ProfileCustomizationPage() {
  const memories = await listMemories();

  return <MemoryPanel initialMemories={memories} />;
}
