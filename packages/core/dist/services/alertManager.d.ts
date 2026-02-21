export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface AlertEvent {
    id: string;
    agentId?: string;
    transactionId?: string;
    severity: AlertSeverity;
    type: string;
    title: string;
    message: string;
    details?: unknown;
}
export declare function createAlert(event: Omit<AlertEvent, 'id'>): void;
//# sourceMappingURL=alertManager.d.ts.map