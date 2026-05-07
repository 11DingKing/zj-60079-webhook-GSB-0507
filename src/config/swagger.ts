import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Webhook Management Platform API',
      version: '1.0.0',
      description: 'Webhook 管理与分发平台 API 文档',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 13079}`,
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Endpoints',
        description: 'Webhook 端点管理',
      },
      {
        name: 'Forwarding Rules',
        description: '转发规则管理',
      },
      {
        name: 'Events',
        description: '事件查询与管理',
      },
      {
        name: 'Statistics',
        description: '统计面板',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  console.log('Swagger 文档已启用: /api-docs');
};
