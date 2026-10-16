/**
 * errorHandler.js
 * Single global error-handling middleware, mounted last in app.js. Any
 * error reaching here via next(err) — including multer's upload-limit
 * errors — gets one uniform JSON shape instead of being handled ad hoc
 * per route. A thrown error with a .status (as the feature services in
 * this app set, e.g. { status: 404 }) keeps that status; anything else
 * defaults to 400, matching this app's existing behavior for bad input.
 */
function errorHandler(err, req, res, next) {
  if (!err) return next();
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 400;
  res.status(status).json({ error: err.message || 'Unexpected error' });
}

module.exports = { errorHandler };
