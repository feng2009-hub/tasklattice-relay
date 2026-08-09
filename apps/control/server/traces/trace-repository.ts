import type { TraceDetail, TraceSummary } from "@tali/contracts";

export interface TraceRepository {
  list(): Promise<TraceSummary[]>;
  getById(traceId: string): Promise<TraceDetail | undefined>;
}
