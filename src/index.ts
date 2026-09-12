import express from 'express';
import { initDatabase } from './config/database.js';
import healthController from './controllers/health.controller.js';

const app = express();
app.use(express.json());
app.use(healthController);

const startServer = async () => {
  await initDatabase();

  app.listen(3000, () => console.log('Running on 3000'));
};

startServer();
