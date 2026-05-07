import { RateLimitService } from './rateLimitService';
import redis from '../lib/redis';

jest.mock('../lib/redis', () => ({
  __esModule: true,
  default: {
    pipeline: jest.fn(),
    zcard: jest.fn(),
    del: jest.fn(),
  },
}));

const mockRedis = redis as jest.Mocked<typeof redis>;

describe('RateLimitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockPipeline = (results: Array<[Error | null, any]>) => {
    const pipeline = {
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(results),
    };
    mockRedis.pipeline.mockReturnValue(pipeline as any);
    return pipeline;
  };

  describe('checkRateLimit', () => {
    it('should allow requests under rate limit (normal放行)', async () => {
      const endpointId = 'endpoint-1';
      const limit = 5;
      
      createMockPipeline([
        [null, 0],
        [null, 1],
        [null, 2],
        [null, 'OK'],
      ]);

      const result = await RateLimitService.checkRateLimit(endpointId, limit);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(2);
      expect(result.limit).toBe(limit);
      expect(result.remaining).toBe(3);
    });

    it('should reject requests over rate limit (超过阈值拒绝)', async () => {
      const endpointId = 'endpoint-2';
      const limit = 3;
      
      createMockPipeline([
        [null, 0],
        [null, 1],
        [null, 5],
        [null, 'OK'],
      ]);

      const result = await RateLimitService.checkRateLimit(endpointId, limit);

      expect(result.isRateLimited).toBe(true);
      expect(result.current).toBe(5);
      expect(result.remaining).toBe(0);
    });

    it('should handle exactly at the limit', async () => {
      const endpointId = 'endpoint-exact';
      const limit = 10;
      
      createMockPipeline([
        [null, 0],
        [null, 1],
        [null, 10],
        [null, 'OK'],
      ]);

      const result = await RateLimitService.checkRateLimit(endpointId, limit);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(10);
      expect(result.remaining).toBe(0);
    });

    it('should handle pipeline failure gracefully', async () => {
      const endpointId = 'endpoint-fail';
      const limit = 10;
      
      const pipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        pexpire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };
      mockRedis.pipeline.mockReturnValue(pipeline as any);

      const result = await RateLimitService.checkRateLimit(endpointId, limit);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(0);
      expect(result.remaining).toBe(limit);
    });

    it('should handle incomplete pipeline results gracefully', async () => {
      const endpointId = 'endpoint-incomplete';
      const limit = 10;
      
      const pipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        pexpire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 0]]),
      };
      mockRedis.pipeline.mockReturnValue(pipeline as any);

      const result = await RateLimitService.checkRateLimit(endpointId, limit);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(0);
    });

    it('should reset remaining requests after window (窗口重置后恢复)', async () => {
      const endpointId = 'endpoint-window';
      const limit = 2;
      
      createMockPipeline([
        [null, 2],
        [null, 1],
        [null, 1],
        [null, 'OK'],
      ]);

      const result = await RateLimitService.checkRateLimit(endpointId, limit);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(1);
    });

    it('should isolate rate limits per endpoint (多key隔离)', async () => {
      const endpointA = 'endpoint-A';
      const endpointB = 'endpoint-B';
      const limit = 3;
      
      const pipelineA = createMockPipeline([
        [null, 0],
        [null, 1],
        [null, 5],
        [null, 'OK'],
      ]);

      const resultA = await RateLimitService.checkRateLimit(endpointA, limit);

      expect(resultA.isRateLimited).toBe(true);
      expect(pipelineA.zadd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should generate unique member names for each request', async () => {
      const endpointId = 'endpoint-unique';
      const limit = 5;
      
      const memberNames: string[] = [];
      let pipelineRef: any;
      const pipeline: any = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zadd: jest.fn((_key: string, _score: number, member: string) => {
          memberNames.push(member);
          return pipelineRef;
        }),
        zcard: jest.fn().mockReturnThis(),
        pexpire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0],
          [null, 1],
          [null, 1],
          [null, 'OK'],
        ]),
      };
      pipelineRef = pipeline;
      mockRedis.pipeline.mockReturnValue(pipeline);

      await RateLimitService.checkRateLimit(endpointId, limit);
      await RateLimitService.checkRateLimit(endpointId, limit);

      expect(memberNames.length).toBe(2);
      expect(memberNames[0]).not.toBe(memberNames[1]);
    });

    it('should calculate reset time correctly', async () => {
      const endpointId = 'endpoint-reset';
      const limit = 10;
      const now = Date.now();
      
      jest.useFakeTimers();
      jest.setSystemTime(now);
      
      createMockPipeline([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 'OK'],
      ]);

      const result = await RateLimitService.checkRateLimit(endpointId, limit);

      expect(result.reset).toBe(now + 60 * 1000);
      
      jest.useRealTimers();
    });
  });

  describe('getCurrentUsage', () => {
    it('should return current usage count', async () => {
      const endpointId = 'endpoint-usage';
      mockRedis.zcard.mockResolvedValue(7);

      const result = await RateLimitService.getCurrentUsage(endpointId);

      expect(result).toBe(7);
      expect(mockRedis.zcard).toHaveBeenCalledWith(`ratelimit:${endpointId}`);
    });
  });

  describe('resetRateLimit', () => {
    it('should delete the rate limit key', async () => {
      const endpointId = 'endpoint-reset';
      mockRedis.del.mockResolvedValue(1);

      await RateLimitService.resetRateLimit(endpointId);

      expect(mockRedis.del).toHaveBeenCalledWith(`ratelimit:${endpointId}`);
    });
  });
});
