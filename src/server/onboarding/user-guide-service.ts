import "server-only";

import { createClient } from "@/lib/supabase/server";
import { USER_GUIDE_KEY, type UserGuideStatus } from "@/features/user-guide/guide-model";

export type UserGuideState = {
  status: UserGuideStatus;
  currentStep: number;
  autoOpen: boolean;
};

export class UserGuideService {
  static async load(userId: string): Promise<UserGuideState> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_guides")
      .select("status,current_step")
      .eq("user_id", userId)
      .eq("guide_key", USER_GUIDE_KEY)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { status: "not_started", currentStep: 0, autoOpen: true };

    const status = data.status as UserGuideStatus;
    return {
      status,
      currentStep: Math.max(0, Number(data.current_step) || 0),
      autoOpen: status === "in_progress" || status === "not_started",
    };
  }
}
