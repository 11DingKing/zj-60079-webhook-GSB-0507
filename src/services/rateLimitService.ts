import redis from '../lib/redis';

export interface RateLimitResult {
  isRateLimited: boolean;
  current: number;
  limit: number;
  remaining: number;
  reset: number;
}

export class RateLimitService {
  private static readonly RATE_LIMIT_PREFIX = 'ratelimit:';

  static async checkRateLimit(
    endpointId: string,
    limitPerMinute: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const key = `${this.RATE_LIMIT_PREFIX}${endpointId}`;

    const pipeline = redis.pipeline();
    
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zadd(key, now, `${now}-${Math.random().toString(36).substr(2, 9)}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    
    if (!results || results.length < 3) {
      return {
        isRateLimited: false,
        current: 0,
        limit: limitPerMinute,
        remaining: limitPerMinute,
        reset: now + windowMs,
      };
    }

    const current = results[2][1] as number;
    const remaining = Math.max(0, limitPerMinute - current);
    const isRateLimited = current > limitPerMinute;

    return {
      isRateLimited,
      current,
      limit: limitPerMinute,
      remaining,
      reset: now + windowMs,
    };
  }

  static async getCurrentUsage(endpointId: string): Promise<number> {
    const key = `${this.RATE_LIMIT_PREFIX}${endpointId}`;
    const count = await redis.zcard(key);
    return count;
  }

  static async resetRateLimit(endpointId: string): Promise<void> {
    const key = `${this.RATE_LIMIT_PREFIX}${endpointId}`;
    await redis.del(key);
  }
}
