import { Request, Response, NextFunction } from 'express';
import { createHash, createHmac, randomBytes } from 'crypto';
import { storage } from './storage';
import type { ApiKey, User } from '@shared/schema';

// Extended Request type to include API key information
export interface ApiKeyRequest extends Request {
  apiKey?: ApiKey;
  apiUser?: User;
  rateLimitInfo?: {
    tier: number;
    requests: number;
    windowStart: number;
  };
}

// Rate limiting store (in-memory for simplicity, use Redis in production)
interface RateLimit {
  requests: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimit>();
const ipRateLimitStore = new Map<string, RateLimit>();

// Rate limit tiers (requests per minute)
const RATE_LIMITS: Record<number, number> = {
  1: 60,    // Basic tier: 60 requests/minute
  2: 300,   // Premium tier: 300 requests/minute  
  3: 1000,  // Enterprise tier: 1000 requests/minute
};

/**
 * Hash API key for secure storage and comparison
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  // Generate a cryptographically secure 32-byte random key and encode as base64
  const secureRandomBytes = randomBytes(32);
  return secureRandomBytes.toString('base64').replace(/[/+=]/g, '').substring(0, 48);
}

/**
 * Middleware to authenticate API key from X-API-Key header
 */
export async function apiKeyAuth(req: ApiKeyRequest, res: Response, next: NextFunction) {
  try {
    const keyId = req.headers['x-api-key'] as string;
    
    if (!keyId) {
      return res.status(401).json({ 
        error: { 
          code: 'MISSING_API_KEY', 
          message: 'API key is required. Provide X-API-Key header with keyId.' 
        } 
      });
    }

    // Get API key with user data from database by ID
    const apiKeyData = await storage.getApiKeyWithUser(keyId);
    
    if (!apiKeyData) {
      return res.status(401).json({ 
        error: { 
          code: 'INVALID_API_KEY', 
          message: 'API key is invalid or has been revoked' 
        } 
      });
    }

    // Check if key is active
    if (apiKeyData.status !== 'active') {
      return res.status(401).json({ 
        error: { 
          code: 'API_KEY_SUSPENDED', 
          message: 'API key has been suspended or revoked' 
        } 
      });
    }

    // Check if key is expired
    if (apiKeyData.expiresAt && new Date() > new Date(apiKeyData.expiresAt)) {
      return res.status(401).json({ 
        error: { 
          code: 'API_KEY_EXPIRED', 
          message: 'API key has expired' 
        } 
      });
    }

    // Update last used timestamp
    await storage.updateApiKeyLastUsed(apiKeyData.id);

    // Attach API key data to request
    req.apiKey = apiKeyData;
    req.apiUser = apiKeyData.user;

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({ 
      error: { 
        code: 'AUTH_ERROR', 
        message: 'Internal server error during authentication' 
      } 
    });
  }
}

/**
 * Middleware to check API key scopes
 */
export function requireScope(requiredScope: 'read' | 'trade' | 'admin') {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey || !req.apiKey.scopes) {
      return res.status(403).json({ 
        error: { 
          code: 'INSUFFICIENT_SCOPE', 
          message: 'API key does not have required permissions' 
        } 
      });
    }

    const scopes = Array.isArray(req.apiKey.scopes) ? req.apiKey.scopes : [req.apiKey.scopes];
    
    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({ 
        error: { 
          code: 'INSUFFICIENT_SCOPE', 
          message: `API key requires '${requiredScope}' scope for this operation` 
        } 
      });
    }

    next();
  };
}

/**
 * IP-based rate limiting middleware for public endpoints
 */
export function ipRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const limit = 100; // 100 requests per minute for public endpoints
    const windowMs = 60 * 1000; // 1 minute window
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    // Get or create rate limit entry
    let rateLimitInfo = ipRateLimitStore.get(clientIp);
    
    if (!rateLimitInfo || rateLimitInfo.windowStart !== windowStart) {
      // New window or first request
      rateLimitInfo = { requests: 0, windowStart };
      ipRateLimitStore.set(clientIp, rateLimitInfo);
    }

    // Check if limit exceeded
    if (rateLimitInfo.requests >= limit) {
      const resetTime = Math.ceil((windowStart + windowMs) / 1000);
      
      res.set({
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetTime.toString(),
        'Retry-After': Math.ceil((windowStart + windowMs - now) / 1000).toString(),
      });

      return res.status(429).json({ 
        error: { 
          code: 'RATE_LIMIT_EXCEEDED', 
          message: `Rate limit exceeded. Limit: ${limit} requests per minute per IP` 
        } 
      });
    }

    // Increment request count
    rateLimitInfo.requests++;
    
    // Set rate limit headers
    const remaining = limit - rateLimitInfo.requests;
    const resetTime = Math.ceil((windowStart + windowMs) / 1000);
    
    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toString(),
    });

    next();
  } catch (error) {
    console.error('IP rate limiting error:', error);
    return res.status(500).json({ 
      error: { 
        code: 'RATE_LIMIT_ERROR', 
        message: 'Internal server error during rate limiting' 
      } 
    });
  }
}

/**
 * API key-based rate limiting middleware for authenticated endpoints
 */
export function rateLimit(req: ApiKeyRequest, res: Response, next: NextFunction) {
  try {
    if (!req.apiKey) {
      return res.status(401).json({ 
        error: { 
          code: 'MISSING_API_KEY', 
          message: 'API key is required for rate limiting' 
        } 
      });
    }

    const keyId = req.apiKey.id;
    const tier = req.apiKey.rateLimitTier || 1;
    const limit = RATE_LIMITS[tier] || RATE_LIMITS[1];
    const windowMs = 60 * 1000; // 1 minute window
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    // Get or create rate limit entry
    let rateLimitInfo = rateLimitStore.get(keyId);
    
    if (!rateLimitInfo || rateLimitInfo.windowStart !== windowStart) {
      // New window or first request
      rateLimitInfo = { requests: 0, windowStart };
      rateLimitStore.set(keyId, rateLimitInfo);
    }

    // Check if limit exceeded
    if (rateLimitInfo.requests >= limit) {
      const resetTime = Math.ceil((windowStart + windowMs) / 1000);
      
      res.set({
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetTime.toString(),
        'Retry-After': Math.ceil((windowStart + windowMs - now) / 1000).toString(),
      });

      return res.status(429).json({ 
        error: { 
          code: 'RATE_LIMIT_EXCEEDED', 
          message: `Rate limit exceeded. Limit: ${limit} requests per minute` 
        } 
      });
    }

    // Increment request count
    rateLimitInfo.requests++;
    
    // Set rate limit headers
    const remaining = limit - rateLimitInfo.requests;
    const resetTime = Math.ceil((windowStart + windowMs) / 1000);
    
    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toString(),
    });

    req.rateLimitInfo = {
      tier,
      requests: rateLimitInfo.requests,
      windowStart,
    };

    next();
  } catch (error) {
    console.error('Rate limiting error:', error);
    return res.status(500).json({ 
      error: { 
        code: 'RATE_LIMIT_ERROR', 
        message: 'Internal server error during rate limiting' 
      } 
    });
  }
}

/**
 * HMAC verification middleware for write operations
 */
export async function verifyHmac(req: ApiKeyRequest, res: Response, next: NextFunction) {
  try {
    if (!req.apiKey) {
      return res.status(401).json({ 
        error: { 
          code: 'MISSING_API_KEY', 
          message: 'API key is required for HMAC verification' 
        } 
      });
    }

    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    if (!signature || !timestamp) {
      return res.status(401).json({ 
        error: { 
          code: 'MISSING_SIGNATURE', 
          message: 'X-Signature and X-Timestamp headers are required for write operations' 
        } 
      });
    }

    // Check timestamp to prevent replay attacks (must be within 5 minutes)
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(now - timestampMs) > maxAge) {
      return res.status(401).json({ 
        error: { 
          code: 'TIMESTAMP_INVALID', 
          message: 'Request timestamp is too old or in the future (max 5 minutes difference)' 
        } 
      });
    }

    // Create message to verify (method + path + body + timestamp)
    const body = req.body ? JSON.stringify(req.body) : '';
    const message = `${req.method}${req.path}${body}${timestamp}`;
    
    // Get the stored signing secret for HMAC verification
    const signingSecret = req.apiKey?.signingSecret;
    if (!signingSecret) {
      return res.status(401).json({ 
        error: { 
          code: 'MISSING_SECRET', 
          message: 'API key signing secret not found' 
        } 
      });
    }

    // Use stored signing secret for HMAC verification
    const expectedSignature = createHmac('sha256', signingSecret)
      .update(message)
      .digest('hex');

    // Verify signature
    if (signature !== expectedSignature) {
      return res.status(401).json({ 
        error: { 
          code: 'INVALID_SIGNATURE', 
          message: 'HMAC signature verification failed' 
        } 
      });
    }

    // Check for nonce replay protection
    const nonce = `${req.apiKey.id}-${timestamp}`;
    const nonceValid = await storage.checkAndStoreNonce(req.apiKey.id, nonce);
    
    if (!nonceValid) {
      return res.status(401).json({ 
        error: { 
          code: 'NONCE_REUSED', 
          message: 'Request nonce has already been used (potential replay attack)' 
        } 
      });
    }

    next();
  } catch (error) {
    console.error('HMAC verification error:', error);
    return res.status(500).json({ 
      error: { 
        code: 'HMAC_ERROR', 
        message: 'Internal server error during HMAC verification' 
      } 
    });
  }
}

/**
 * Cleanup expired rate limit entries (should be called periodically)
 */
export function cleanupRateLimits() {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const currentWindow = Math.floor(now / windowMs) * windowMs;

  // Clean up API key rate limits
  for (const [keyId, rateLimitInfo] of Array.from(rateLimitStore.entries())) {
    if (rateLimitInfo.windowStart < currentWindow - windowMs) {
      rateLimitStore.delete(keyId);
    }
  }

  // Clean up IP rate limits
  for (const [ip, rateLimitInfo] of Array.from(ipRateLimitStore.entries())) {
    if (rateLimitInfo.windowStart < currentWindow - windowMs) {
      ipRateLimitStore.delete(ip);
    }
  }
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
  cleanupRateLimits();
  storage.cleanupExpiredNonces().catch(console.error);
}, 5 * 60 * 1000);