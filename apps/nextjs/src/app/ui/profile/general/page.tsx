import { GeneralTab } from "~/features/profile/components/general/general-tab";
import { ProfileShell } from "~/features/profile/components/profile-shell";
import {
  previewProfileAccount,
  previewProfileBilling,
  previewProfileGeneral,
} from "~/features/profile/lib/preview-data";

export default function UiPreviewProfileGeneralPage() {
  return (
    <ProfileShell basePath="/ui/profile" activeTab="general">
      <GeneralTab
        initialGeneral={previewProfileGeneral}
        account={previewProfileAccount}
        billing={previewProfileBilling}
      />
    </ProfileShell>
  );
}
