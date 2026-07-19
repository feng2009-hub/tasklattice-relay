import type { Agent } from "@tasklattice/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { adaptAgentToAuditorLogs, filterAuditorLogs, type AuditorLogFilters } from "./auditor-log-utils";

export type UseAuditorLogOptions = AuditorLogFilters & {
  live?: boolean;
};

export function useAuditorLog(agent: Agent, options: UseAuditorLogOptions) {
  const query = useQuery({
    queryKey: ["agent-audit", agent.id],
    queryFn: () => api.getAgentAudit(agent.id),
    retry: 1,
    staleTime: 5_000,
    refetchInterval: options.live ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const allData = useMemo(() => adaptAgentToAuditorLogs(agent, query.data ?? []), [agent, query.data]);
  const data = useMemo(() => filterAuditorLogs(allData, options), [allData, options]);

  return {
    allData,
    data,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error : undefined,
    connected: !query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
