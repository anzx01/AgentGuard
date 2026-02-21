export interface KillSwitchState {
    global: {
        paused: boolean;
        pausedAt?: string;
        pausedBy?: string;
        reason?: string;
    };
    agents: Record<string, {
        paused: boolean;
        pausedAt?: string;
        pausedBy?: string;
    }>;
}
export declare function loadKillSwitchState(): void;
export declare function getKillSwitchState(): KillSwitchState;
export declare function activateGlobal(reason: string, pausedBy?: string): void;
export declare function deactivateGlobal(): void;
export declare function pauseAgent(agentId: string, pausedBy?: string): void;
export declare function resumeAgent(agentId: string): void;
export declare function isBlocked(agentId?: string): {
    blocked: boolean;
    reason?: string;
};
//# sourceMappingURL=killSwitch.d.ts.map