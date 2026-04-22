/**
 * Security Audit Logging for MCP Server
 * 
 * Provides tamper-evident logging for security-relevant events:
 * - Tool invocations
 * - Authentication failures
 * - Rate limiting events
 * - Errors and anomalies
 */

export type AuditEventType = 
  | "tool_call"
  | "auth_failure" 
  | "rate_limit"
  | "validation_error"
  | "server_error";

export interface AuditEvent {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event classification */
  type: AuditEventType;
  /** Tool name if applicable */
  toolName?: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Optional error message (generic, no sensitive data) */
  error?: string;
  /** Request ID for correlation */
  requestId?: string | number;
  /** Optional: source IP or client identifier */
  clientId?: string;
}

/**
 * Writes an audit event to stderr in a structured format.
 * Uses stderr to avoid interfering with MCP stdout protocol.
 * Format: JSON with guidemd_audit marker for filtering.
 */
export function logAudit(event: AuditEvent): void {
  const logEntry = {
    _event: "guidemd_audit",
    _v: "1.0",
    ...event
  };
  
  // Use stderr to avoid polluting MCP stdout
  console.error(JSON.stringify(logEntry));
}

/**
 * Logs a successful tool invocation.
 */
export function logToolCall(
  toolName: string, 
  success: boolean, 
  requestId?: string | number,
  error?: string
): void {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    type: "tool_call",
    toolName,
    success,
    ...(requestId !== undefined && { requestId }),
    ...(error !== undefined && { error: sanitizeError(error) })
  };
  logAudit(event);
}

/**
 * Logs an authentication/authorization failure.
 */
export function logAuthFailure(
  reason: string,
  requestId?: string | number
): void {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    type: "auth_failure",
    success: false,
    error: sanitizeError(reason),
    ...(requestId !== undefined && { requestId })
  };
  logAudit(event);
}

/**
 * Logs a rate limiting event.
 */
export function logRateLimit(
  clientId?: string
): void {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    type: "rate_limit",
    success: false,
    ...(clientId !== undefined && { clientId })
  };
  logAudit(event);
}

/**
 * Sanitizes error messages to prevent information disclosure.
 * Removes file paths, stack traces, and dangerous internal property access.
 */
function sanitizeError(error: string): string {
  // Remove file paths (Unix and Windows)
  let sanitized = error.replace(/(\/[^/\s]+)+\/?|([A-Za-z]:\\[^\\\s]+)+\\?/g, "[PATH]");
  // Remove stack trace lines (format: "at functionName (path:line:column)")
  sanitized = sanitized.replace(/at\s+.*\s*\([^)]*\)/g, "[STACK]");
  // Remove line:column references that might leak file structure
  sanitized = sanitized.replace(/:\d+:\d+/g, ":[LINE]:[COL]");
  // Only sanitize dangerous property access patterns (prototype, constructor, __proto__)
  // NOT all property access - this was too aggressive and broke legitimate messages
  sanitized = sanitized.replace(/\.(prototype|constructor|__proto__)/g, ".[PROP]");
  return sanitized.substring(0, 200); // Limit length
}
