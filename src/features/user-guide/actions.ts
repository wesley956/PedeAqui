"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { USER_GUIDE_KEY } from "@/features/user-guide/guide-model";

const inputSchema = z.object({
  status: z.enum(["in_progress", "skipped", "completed"]),
  currentStep: z.number().int().min(0).max(20),
});

export async function saveUserGuideProgressAction(input: unknown) {
  const parsed = inputSchema.parse(input);
  const user = await requireAuthenticatedUser();
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from("user_guides")
    .select("started_at,skipped_at,completed_at")
    .eq("user_id", user.id)
    .eq("guide_key", USER_GUIDE_KEY)
    .maybeSingle();
  if (readError) throw readError;

  const { error } = await supabase.from("user_guides").upsert({
    user_id: user.id,
    guide_key: USER_GUIDE_KEY,
    status: parsed.status,
    current_step: parsed.currentStep,
    started_at: existing?.started_at ?? now,
    skipped_at: parsed.status === "skipped" ? now : parsed.status === "in_progress" ? null : existing?.skipped_at ?? null,
    completed_at: parsed.status === "completed" ? now : existing?.completed_at ?? null,
    updated_at: now,
  }, { onConflict: "user_id,guide_key" });

  if (error) throw error;
  return { ok: true } as const;
}
