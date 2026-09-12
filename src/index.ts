import 'dotenv/config';
import express from 'express';
import { initDatabase } from './config/database.js';
import healthController from './controllers/health.controller.js';
import walletController from './controllers/wallet.controller.js';
import transfersController from './controllers/transfer.controller.js';
import { logger } from './config/logger.js';
import { requestLogger } from './config/request.logger.js';

const app = express();
app.use(requestLogger);
app.use(express.json());
app.use(healthController);
app.use(walletController);
app.use(transfersController);

const startServer = async () => {
  await initDatabase();

  app.listen(3000, () => logger.info('Running on 3000'));
};

startServer();
