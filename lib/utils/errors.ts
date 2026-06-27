export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: Error) {
    const message = `External service error: ${service}${originalError ? ` - ${originalError.message}` : ''}`;
    super(message, 503);
  }
}

// Error handling utilities
export function handleError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError(error.message, 500);
  }
  
  return new AppError('An unexpected error occurred', 500);
}

export function createErrorResponse(error: AppError) {
  return {
    success: false,
    error: {
      message: error.message,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString()
    }
  };
}

// Rate limiting utility
export class RateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  
  constructor(
    private windowMs: number = 60000,
    private maxRequests: number = 10
  ) {}
  
  checkLimit(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const window = this.requests.get(identifier);
    
    if (!window || now > window.resetTime) {
      // New window
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      };
    }
    
    if (window.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: window.resetTime
      };
    }
    
    window.count++;
    this.requests.set(identifier, window);
    
    return {
      allowed: true,
      remaining: this.maxRequests - window.count,
      resetTime: window.resetTime
    };
  }
  
  clearExpired() {
    const now = Date.now();
    for (const [key, window] of this.requests.entries()) {
      if (now > window.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// Logging utility
export class Logger {
  static info(message: string, meta?: any) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta || '');
  }
  
  static warn(message: string, meta?: any) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta || '');
  }
  
  static error(message: string, error?: any) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '');
  }
  
  static debug(message: string, meta?: any) {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta || '');
  }
}