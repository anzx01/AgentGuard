export interface BudgetSummary {
    todaySpend: number;
    monthSpend: number;
    todayCalls: number;
    todayBlocked: number;
}
export declare function getTodayKey(): string;
export declare function getMonthKey(): string;
export declare function getHourKey(): string;
export declare function recordTransaction(params: {
    agentId: string | null;
    cost: number;
    allowed: boolean;
}): void;
export declare function getAgentDailySpend(agentId: string): number;
export declare function getAgentMonthSpend(agentId: string): number;
export declare function getGlobalSummary(): BudgetSummary;
//# sourceMappingURL=budgetManager.d.ts.map