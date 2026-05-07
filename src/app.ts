import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rawBodyParser } from './middleware/rawBodyParser';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { setupSwagger } from './config/swagger';
import { webhookRoutes } from './routes/webhook';
import { apiRoutes } from './routes/api';
import { hookReceiver } from './routes/hooks';

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(rawBodyParser());

setupSwagger(app);

app.use('/api', apiRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/hooks', hookReceiver);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
