import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app';
import logger from './utils/logger';
import { MONGODB_URI, PORT } from './config';

// Load environment variables
dotenv.config();

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection', error);
  process.exit(1);
});

startServer(); 