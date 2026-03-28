import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { getUserById, getAllUsers, getUserCredits, getUserUsage } from '../lib/db/users';
import { db } from '../lib/db/pg';
import { credits, purchases, usageLogs, apiKeys } from '../lib/db/schema';
import { sql, eq } from 'drizzle-orm';

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

  jwt.verify(token, config.jwtSecret, async (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
      });
    }
    
    const user = await getUserById(decoded.userId);
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
    const usersList = await getAllUsers();
    
    const totalCreditsResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${credits.amount}), 0)` 
    }).from(credits).where(sql`${credits.amount} > 0`);
    
    const totalRevenueResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${purchases.amountPaid}), 0)` 
    }).from(purchases).where(eq(purchases.status, 'completed'));
    
    const totalRequestsResult = await db.select({ 
      total: sql<number>`COUNT(*)` 
    }).from(usageLogs);

    const usersWithCredits = await Promise.all(
      usersList.map(async (u) => ({
        ...u,
        credits: await getUserCredits(u.id),
        apiKeyCount: (await db.select({ count: sql<number>`COUNT(*)` })
          .from(apiKeys)
          .where(eq(apiKeys.userId, u.id)))[0]?.count || 0,
      }))
    );
    
    res.json({
      success: true,
      data: {
        totalUsers: usersList.length,
        totalCreditsPurchased: Number(totalCreditsResult[0]?.total) || 0,
        totalRevenue: Number(totalRevenueResult[0]?.total) || 0,
        totalRequests: Number(totalRequestsResult[0]?.total) || 0,
        users: usersWithCredits,
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
