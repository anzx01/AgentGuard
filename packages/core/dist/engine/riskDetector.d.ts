export interface RiskResult {
    risky: boolean;
    reason?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
}
export declare function recordFailure(agentId: string): number;
export declare function resetFailures(agentId: string): void;
export declare function getConsecutiveFailures(agentId: string): number;
export declare function detectRisk(params: {
    agentId: string;
    targetUrl: string;
    targetService: string;
    estimatedAmount: number;
    method: string;
}): RiskResult;
//# sourceMappingURL=riskDetector.d.ts.map