import { Router } from 'express';
import { queryDatabase } from '../config/database.js';
import { handleError } from '../utils/error.handler.js';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    const result = await queryDatabase('SELECT NOW() as current_time');
    const currentTime = result.rows[0]?.current_time;

    res.status(200).json({
      success: true,
      message: 'Database is connected',
      data: {
        currentTime,
      },
    });
  } catch (error) {
    return handleError(error, res, "Database connection failed");
  }
});

export default router;
