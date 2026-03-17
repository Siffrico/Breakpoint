import { DomainSelection } from "~/features/esde/components/domain-selection";
import { getLearningDomainCatalog } from "~/features/esde/server/esde-queries";

export default async function HomePage() {
  const domains = await getLearningDomainCatalog();

  return <DomainSelection domains={domains} />;
}
