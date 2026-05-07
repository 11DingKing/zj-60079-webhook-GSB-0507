import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  console.log('Redis 连接成功');
});

redis.on('error', (err) => {
  console.error('Redis 连接错误:', err);
});

export default redis;
