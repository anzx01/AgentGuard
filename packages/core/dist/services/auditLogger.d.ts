export interface LogEntry {
    id: string;
    agentId: string | null;
    method: string;
    targetUrl: string;
    targetService: string;
    requestHeaders?: Record<string, string>;
    requestSize?: number;
    decision: 'allow' | 'block' | 'error';
    blockedRuleId?: string;
    blockReason?: string;
    responseStatus?: number;
    responseSize?: number;
    latencyMs?: number;
    proxyLatencyMs?: number;
    estimatedCost?: number;
    ipAddress?: string;
    isStreaming?: boolean;
}
export declare function logRequest(entry: LogEntry): void;
export declare function logConfigChange(params: {
    action: string;
    resourceType: string;
    resourceId?: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string;
}): void;
export declare function logSystemEvent(type: string, message: string, severity?: string, details?: unknown): void;
//# sourceMappingURL=auditLogger.d.ts.map