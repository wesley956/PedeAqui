import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AgentScope = { id: string; organization_id: string; store_id: string };

export class PrintAgentConfigurationService {
  static async list(agent: AgentScope) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("printers")
      .select("id, name, connection_type, connection_address, connection_port, paper_width_mm")
      .eq("organization_id", agent.organization_id)
      .eq("store_id", agent.store_id)
      .eq("agent_id", agent.id)
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return (data ?? []).map((printer) => ({
      id: printer.id,
      name: printer.name,
      connectionType: printer.connection_type,
      address: printer.connection_address,
      port: printer.connection_port,
      paperWidthMm: Number(printer.paper_width_mm),
    }));
  }
}
