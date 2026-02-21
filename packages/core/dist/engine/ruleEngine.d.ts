export interface RuleCheckContext {
    agentId: string;
    targetUrl: string;
    targetService: string;
    method: string;
    estimatedAmount: number;
}
export interface RuleDecision {
    allowed: boolean;
    reason?: string;
    ruleId?: string;
    action?: string;
}
export declare function evaluateRules(ctx: RuleCheckContext): RuleDecision;
//# sourceMappingURL=ruleEngine.d.ts.map