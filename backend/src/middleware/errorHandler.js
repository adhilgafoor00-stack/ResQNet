/**
 * Global Error Handler Middleware
 * Returns JSON { success: false, error: message }
 * Catches all unhandled errors gracefully
 */
const errorHandler = (err, req, res, next) => {
  console.error('Server Error:', err.message);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, error: messages.join(', ') });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({ success: false, error: 'Duplicate entry' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Token expired' });
  }

  // Default server error
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
};

module.exports = errorHandler;
