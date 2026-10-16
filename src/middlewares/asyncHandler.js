/**
 * asyncHandler.js
 * Wraps an async route handler so a rejected promise reaches Express's
 * error-handling middleware (errorHandler.js) instead of becoming an
 * unhandled rejection. Express 4 (unlike 5) does NOT await async route
 * handlers or catch their rejections — without this, any real database
 * error (a timeout, a dropped connection, a lock-wait timeout under
 * concurrent load) in an unguarded async handler crashes the ENTIRE
 * server process, not just that one request. Confirmed the hard way: a
 * concurrent read during a long-running MSSQL import timed out, and an
 * unwrapped controller method took the whole process down with it.
 *
 * Every route registration in every *.router.js wraps its controller
 * method with this — see any router file for the pattern.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
