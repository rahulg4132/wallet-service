import express from 'express';
import { connectDatabase } from './config/database.js';
import healthController from './controllers/health.controller.js';

const app = express();
app.use(express.json());
app.use(healthController);

const startServer = async () => {
  const isConnected = await connectDatabase();

  if (!isConnected) {
    console.error('Server failed to start...');
    console.error('No database connection...');
    return;
  }

  app.listen(3000, () => console.log('Running on 3000'));
};

startServer();
