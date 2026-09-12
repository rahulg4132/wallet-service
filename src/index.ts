import 'dotenv/config';
import express from 'express';
import { initDatabase } from './config/database.js';
import healthController from './controllers/health.controller.js';
import walletController from './controllers/wallet.controller.js';
import metricsController from './controllers/metrics.controller.js';
import transfersController from './controllers/transfer.controller.js';
import { logger } from './config/logger.js';
import { requestLogger } from './config/request.logger.js';
import { correlationId } from './middleware/middleware.js';

const app = express();
app.use(correlationId);
app.use(requestLogger);
app.use(express.json());
app.use(metricsController);
app.use(healthController);
app.use(walletController);
app.use(transfersController);

const startServer = async () => {
  await initDatabase();

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => logger.info({ port }, 'Running'));
};

startServer();
