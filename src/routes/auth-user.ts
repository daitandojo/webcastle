import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { createUser, getUserByEmail, getUserById, getUserCredits, getUserApiKeys, createApiKey, deleteApiKey, verifyApiKey, getUserUsage } from '../lib/db/users';
import { createCheckoutSession, CREDIT_PACKAGES, getPurchaseHistory } from '../lib/db/stripe';
import { z, ZodError } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
      });
    }

    const user = createUser({ email, password, name });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    const initialCredits = 10;
    const { addCredits } = await import('../lib/db/users');
    addCredits(user.id, initialCredits);

    res.status(201).json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        token,
        credits: initialCredits,
      },
    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const { verifyPassword } = await import('../lib/db/users');
    const valid = verifyPassword(user, password);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    const credits = getUserCredits(user.id);

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        token,
        credits,
      },
    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

function authenticateToken(req: Request, res: Response, next: Function) {
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
    req.body.userId = decoded.userId;
    next();
  });
}

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId;
    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const credits = getUserCredits(userId);
    const apiKeys = getUserApiKeys(userId);
    const usage = getUserUsage(userId, 30);
    const purchases = getPurchaseHistory(userId);

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
        credits,
        apiKeys,
        usage,
        purchases,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.post('/api-keys', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId;
    const { name } = createKeySchema.parse(req.body);

    const apiKey = createApiKey(userId, name);

    res.status(201).json({
      success: true,
      data: apiKey,
    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.issues },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.delete('/api-keys/:keyId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId;
    const { keyId } = req.params;

    const deleted = deleteApiKey(userId, keyId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' },
      });
    }

    res.json({ success: true, message: 'API key deleted' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.post('/credits/checkout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId;
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PACKAGE', message: 'Package ID required' },
      });
    }

    const session = await createCheckoutSession(userId, packageId);

    res.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'CHECKOUT_ERROR', message: error.message },
    });
  }
});

router.get('/credits/packages', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: CREDIT_PACKAGES.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price / 100,
    })),
  });
});

export default router;
