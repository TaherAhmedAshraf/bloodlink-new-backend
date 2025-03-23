import express, { Express } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app: Express = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API Routes
app.use('/api', routes);

// Error handling middleware
app.use(errorHandler);

export default app; 