import { Router } from 'express';
import { queryDatabase } from '../config/database.js';

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
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
});

export default router;
