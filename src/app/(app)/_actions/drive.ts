"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { disconnectDrive, setDriveFolder } from "@/features/drive/service";
import { protectedAction } from "@/lib/action";

/** Settings → Google Drive: save the folder link (checked with Google first). */
export const setDriveFolderAction = protectedAction(
  { permission: "manageSettings", schema: z.object({ folderLink: z.string().trim().min(1, { error: "Paste the folder link." }).max(500) }) },
  async ({ folderLink }) => {
    const r = await setDriveFolder(folderLink);
    revalidatePath("/", "layout");
    return r;
  },
);

/** Settings → Google Drive: forget the account (and cancel the key at Google). */
export const disconnectDriveAction = protectedAction({ permission: "manageSettings", schema: z.object({}) }, async () => {
  await disconnectDrive();
  revalidatePath("/", "layout");
  return null;
});
