import type { VirtualEmployee } from "@tasklattice/contracts";

import { EffectiveMcpAccess } from "@/components/access/effective-mcp-access";

export function VirtualEmployeeEffectiveAccessPreview({
  employee,
}: {
  employee: VirtualEmployee;
  projectId: string;
}) {
  return <EffectiveMcpAccess virtualEmployeeId={employee.id} />;
}
