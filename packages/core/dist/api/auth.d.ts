import { Router, Request, Response } from 'express';
export declare function createAuthRouter(): Router;
export declare function requireAuth(req: Request, res: Response, next: () => void): Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map