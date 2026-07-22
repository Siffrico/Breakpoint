import type { FileRouter } from "uploadthing/next";
import { createUploadthing } from "uploadthing/next";

import { requireSession } from "~/app/api/_lib/require-session";

const f = createUploadthing();

export const ourFileRouter = {
  missionProof: f({ image: { maxFileSize: "4MB", maxFileCount: 3 } })
    .middleware(async ({ req }) => {
      const session = await requireSession(req);
      if (!session) throw new Error("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(({ metadata, file }) => ({
      userId: metadata.userId,
      url: file.ufsUrl,
    })),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
