import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { getUserById, getAllUsers, getUserCredits, getUserUsage } from '../lib/db/users';
import { db } from '../lib/db/index';

const router = Router();

function authenticateAdmin(req: Request, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token required' },
    });
  }

  jwt.verify(token, config.jwtSecret, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
      });
    }
    
    const user = getUserById(decoded.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }
    
    req.body.userId = decoded.userId;
    next();
  });
}

router.get('/stats', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const users = getAllUsers();
    
    const totalCreditsStmt = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM credits WHERE amount > 0
    `);
    const totalCreditsResult = totalCreditsStmt.get() as { total: number };
    
    const totalRevenueStmt = db.prepare(`
      SELECT COALESCE(SUM(amount_paid), 0) as total FROM purchases WHERE status = 'completed'
    `);
    const totalRevenueResult = totalRevenueStmt.get() as { total: number };
    
    const totalRequestsStmt = db.prepare(`
      SELECT COUNT(*) as total FROM usage_logs
    `);
    const totalRequestsResult = totalRequestsStmt.get() as { total: number };
    
    res.json({
      success: true,
      data: {
        totalUsers: users.length,
        totalCreditsPurchased: totalCreditsResult.total,
        totalRevenue: totalRevenueResult.total,
        totalRequests: totalRequestsResult.total,
        users: users.map(u => ({
          ...u,
          credits: getUserCredits(u.id),
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

export default router;
