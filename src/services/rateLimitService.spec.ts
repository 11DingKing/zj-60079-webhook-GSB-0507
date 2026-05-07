import { RateLimitService } from './rateLimitService';

jest.mock('../lib/redis', () => {
  const mockPipelineExec = jest.fn();
  const mockZremrangebyscore = jest.fn().mockReturnThis();
  const mockZadd = jest.fn().mockReturnThis();
  const mockZcardPipeline = jest.fn().mockReturnThis();
  const mockPexpire = jest.fn().mockReturnThis();
  const pipelineObj = {
    zremrangebyscore: mockZremrangebyscore,
    zadd: mockZadd,
    zcard: mockZcardPipeline,
    pexpire: mockPexpire,
    exec: mockPipelineExec,
  };
  return {
    __esModule: true,
    default: {
      pipeline: jest.fn(() => pipelineObj),
      zcard: jest.fn(),
      del: jest.fn(),
    },
    __mocks: {
      pipelineExec: mockPipelineExec,
      zremrangebyscore: mockZremrangebyscore,
    },
  };
});

const getRedisMock = () => jest.requireMock('../lib/redis').default;
const getMockExtras = () => jest.requireMock('../lib/redis').__mocks;

describe('RateLimitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow request when under the limit (normal pass)', async () => {
      const { pipelineExec } = getMockExtras();
      pipelineExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 3],
        [null, 1],
      ]);

      const result = await RateLimitService.checkRateLimit('endpoint-1', 60);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(3);
      expect(result.limit).toBe(60);
      expect(result.remaining).toBe(57);
    });

    it('should block request when over the limit (threshold deny)', async () => {
      const { pipelineExec } = getMockExtras();
      pipelineExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 61],
        [null, 1],
      ]);

      const result = await RateLimitService.checkRateLimit('endpoint-1', 60);

      expect(result.isRateLimited).toBe(true);
      expect(result.current).toBe(61);
      expect(result.limit).toBe(60);
      expect(result.remaining).toBe(0);
    });

    it('should allow requests again after window resets', async () => {
      const { pipelineExec } = getMockExtras();
      pipelineExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      const result = await RateLimitService.checkRateLimit('endpoint-1', 60);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(59);
    });

    it('should isolate rate limits per endpoint key (multi-key isolation)', async () => {
      const { pipelineExec } = getMockExtras();
      pipelineExec
        .mockResolvedValueOnce([
          [null, 0],
          [null, 1],
          [null, 50],
          [null, 1],
        ])
        .mockResolvedValueOnce([
          [null, 0],
          [null, 1],
          [null, 5],
          [null, 1],
        ]);

      const result1 = await RateLimitService.checkRateLimit('endpoint-A', 60);
      const result2 = await RateLimitService.checkRateLimit('endpoint-B', 60);

      expect(result1.isRateLimited).toBe(false);
      expect(result1.current).toBe(50);
      expect(result2.isRateLimited).toBe(false);
      expect(result2.current).toBe(5);
      expect(result1.remaining).not.toBe(result2.remaining);
    });

    it('should return safe defaults when pipeline returns no results', async () => {
      const { pipelineExec } = getMockExtras();
      pipelineExec.mockResolvedValue(null);

      const result = await RateLimitService.checkRateLimit('endpoint-1', 60);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(0);
      expect(result.remaining).toBe(60);
    });

    it('should return safe defaults when pipeline returns too few results', async () => {
      const { pipelineExec } = getMockExtras();
      pipelineExec.mockResolvedValue([[null, 0]]);

      const result = await RateLimitService.checkRateLimit('endpoint-1', 60);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(0);
      expect(result.remaining).toBe(60);
    });

    it('should set remaining to 0 when at exact limit', async () => {
      const { pipelineExec } = getMockExtras();
      pipelineExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 60],
        [null, 1],
      ]);

      const result = await RateLimitService.checkRateLimit('endpoint-1', 60);

      expect(result.isRateLimited).toBe(false);
      expect(result.current).toBe(60);
      expect(result.remaining).toBe(0);
    });

    it('should use correct Redis key prefix', async () => {
      const { pipelineExec, zremrangebyscore } = getMockExtras();
      pipelineExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await RateLimitService.checkRateLimit('my-endpoint', 60);

      expect(zremrangebyscore).toHaveBeenCalledWith(
        'ratelimit:my-endpoint',
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  describe('getCurrentUsage', () => {
    it('should return current count from Redis', async () => {
      const redis = getRedisMock();
      redis.zcard.mockResolvedValue(42);

      const count = await RateLimitService.getCurrentUsage('endpoint-1');

      expect(count).toBe(42);
      expect(redis.zcard).toHaveBeenCalledWith('ratelimit:endpoint-1');
    });
  });

  describe('resetRateLimit', () => {
    it('should delete the rate limit key', async () => {
      const redis = getRedisMock();
      redis.del.mockResolvedValue(1);

      await RateLimitService.resetRateLimit('endpoint-1');

      expect(redis.del).toHaveBeenCalledWith('ratelimit:endpoint-1');
    });
  });
});
