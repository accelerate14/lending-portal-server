const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const bodyParser = require("body-parser");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Original routes preserved
const borrowerRoutes = require('./routes/borrower/borrower.routes');
const lenderRoutes = require('./routes/lender/lender.routes');

dotenv.config();

// ==========================================
// WINSTON LOGGER CONFIGURATION
// ==========================================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'financial-lending-server' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({ filename: 'logs/combined.log' }),
    // Write all error logs to error.log
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
  ],
});

// In development, also log to console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// ==========================================
// EXPRESS APP SETUP
// ==========================================
const app = express();
const port = process.env.PORT || 8000;

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Helmet - Sets various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// Rate Limiting - Prevents brute-force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login/register attempts per windowMs
  message: { error: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/borrower/login', authLimiter);
app.use('/api/borrower/register', authLimiter);

// ==========================================
// CORS CONFIGURATION
// ==========================================

// Dynamic patterns for allowed origins (localhost, local network, UiPath)
const allowedOriginPatterns = [
  /^https?:\/\/localhost(:\d+)?$/,                    // localhost with any port
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,                 // loopback with any port
  /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,           // local network (192.168.x.x)
  /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,            // local network (10.x.x.x)
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/, // local network (172.16-31.x.x)
  /^https?:\/\/cloud\.uipath\.com/,                   // UiPath cloud
];

// Specific production origins from env var
const specificOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : [];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check against dynamic patterns
    const isPatternMatch = allowedOriginPatterns.some(pattern => pattern.test(origin));
    // Check against specific origins from env
    const isSpecificMatch = specificOrigins.includes(origin);
    
    if (isPatternMatch || isSpecificMatch) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ==========================================
// BODY PARSING & SESSION
// ==========================================
app.use(bodyParser.json({ limit: '10mb' })); // Limit request size
app.use(bodyParser.urlencoded({ extended: true }));

// Session Configuration
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === 'dfsf94835asda') {
  logger.warn('WARNING: Using default session secret. Set SESSION_SECRET in production!');
}

const SESSION_COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE === 'true';

app.use(session({
  secret: SESSION_SECRET || 'dfsf94835asda',
  resave: true,
  saveUninitialized: true,
  cookie: { 
    secure: SESSION_COOKIE_SECURE,
    httpOnly: true, // Prevent XSS attacks
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ==========================================
// REQUEST LOGGING MIDDLEWARE
// ==========================================
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// ==========================================
// ROUTES
// ==========================================
app.use('/api/borrower', borrowerRoutes);
app.use('/api/lender', lenderRoutes);

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'Healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Basic root endpoint
app.get('/', (req, res) => res.json({
  status: "Financial Lending Server is running",
  health: "/health",
  api: {
    borrower: "/api/borrower",
    lender: "/api/lender"
  }
}));

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found' });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Don't leak error details to client
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(port, "0.0.0.0", () => {
  logger.info(`Server running at http://0.0.0.0:${port}`, {
    port,
    environment: process.env.NODE_ENV || 'development'
  });
  console.log(`Server running at http://127.0.0.1:${port}`);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason, promise });
  process.exit(1);
});

module.exports = app;