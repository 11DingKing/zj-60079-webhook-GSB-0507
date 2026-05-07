import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Webhook Management Platform API',
    endpoints: {
      webhookReceiver: 'POST /hooks/:endpointPath',
      documentation: 'GET /api-docs',
    },
  });
});

export const webhookRoutes = router;
