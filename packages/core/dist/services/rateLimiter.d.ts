export interface RateLimitRule {
    maxRequests: number;
    windowSeconds: number;
}
export declare function checkRateLimit(agentId: string, service: string, rule: RateLimitRule): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};
export declare function clearAgentWindows(agentId: string): void;
//# sourceMappingURL=rateLimiter.d.ts.map