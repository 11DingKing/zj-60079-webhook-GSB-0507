import app from './app';
import { config } from './config';
import prisma from './lib/prisma';

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('数据库连接成功');

    app.listen(config.port, () => {
      console.log(`服务器运行在 http://localhost:${config.port}`);
      console.log(`API 文档: http://localhost:${config.port}/api-docs`);
      console.log(`环境: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  console.log('正在关闭服务器...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
