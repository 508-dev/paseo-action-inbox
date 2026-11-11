import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const inboxPreferences = defineSettings({
  id: "inbox",
  scope: "device",
  version: 1,
  schema: z.object({ readTokens: z.record(z.string(), z.string()).default({}) }),
});
