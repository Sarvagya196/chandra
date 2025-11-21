/**
 * API Request Logger Middleware
 * Logs all API calls with method, path, user, timestamp, and response status
 */
function apiLogger(req, res, next) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  // Get user info if available (set by authenticateToken middleware)
  const userId = req.user?._id || 'anonymous';
  const userRole = req.user?.role || 'none';
  
  // Get client IP
  const clientIp = req.ip || 
                   req.connection?.remoteAddress || 
                   req.headers['x-forwarded-for']?.split(',')[0] || 
                   'unknown';

  // Log request details
  console.log(`\n📥 [${timestamp}] ${req.method} ${req.originalUrl || req.url}`);
  console.log(`   👤 User: ${userId} (${userRole})`);
  console.log(`   🌐 IP: ${clientIp}`);
  
  // Log query parameters if present
  if (Object.keys(req.query).length > 0) {
    console.log(`   🔍 Query:`, req.query);
  }
  
  // Log request body for POST/PUT/PATCH (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const sanitizedBody = { ...req.body };
    // Remove sensitive fields from logs
    if (sanitizedBody.password) sanitizedBody.password = '***';
    if (sanitizedBody.token) sanitizedBody.token = '***';
    if (sanitizedBody.authorization) sanitizedBody.authorization = '***';
    console.log(`   📦 Body:`, JSON.stringify(sanitizedBody).substring(0, 200));
  }

  // Capture response details
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' : 
                       statusCode >= 400 && statusCode < 500 ? '⚠️' : 
                       statusCode >= 500 ? '❌' : 'ℹ️';
    
    console.log(`📤 [${new Date().toISOString()}] ${statusEmoji} ${req.method} ${req.originalUrl || req.url} - ${statusCode} (${duration}ms)`);
    
    return originalSend.call(this, data);
  };

  next();
}

module.exports = apiLogger;

