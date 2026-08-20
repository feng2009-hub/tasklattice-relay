import type { Instance as Agent } from "@tali/contracts";

import { EffectiveMcpAccess } from "@/components/access/effective-mcp-access";

export function InstanceEffectiveAccessPreview({ agent }: { agent: Agent }) {
  return <EffectiveMcpAccess agent={agent} />;
}
