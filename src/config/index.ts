import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '13079', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://dev:dev123456@localhost:15079/db_zj_60079',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:16379',
  },
  
  forwarding: {
    defaultTimeout: 10000,
    defaultMaxRetries: 3,
    retryDelays: [1000, 2000, 4000],
  },
};
