const { getEntityInstance } = require('./uipath');
const winston = require('winston');

const auditEntityName = process.env.UIPATH_AUDIT_LOG_ENTITY_NAME || 'FLCMAuditLog';
const auditEnabled = process.env.ENABLE_AUDIT_LOGGING !== 'false'; // Enabled by default

// File-based audit log as fallback
const auditFileLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/audit.log' }),
  ],
});

/**
 * Log an audit event to both UiPath Data Service and file
 * @param {Object} auditData - Audit log data
 * @param {string} auditData.UserId - Who performed the action
 * @param {string} auditData.UserRole - Role of the user
 * @param {string} auditData.Action - What action was performed
 * @param {string} auditData.EntityType - What type of entity was affected
 * @param {string} auditData.EntityId - ID of the affected record
 * @param {string} auditData.CaseId - Loan case reference
 * @param {Object} [auditData.OldValue] - Previous state (for updates)
 * @param {Object} [auditData.NewValue] - New state (for updates)
 * @param {string} auditData.IpAddress - User's IP address
 * @param {string} [auditData.UserAgent] - Browser/device info
 * @param {string} auditData.Description - Human-readable description
 * @param {string} [auditData.Severity='Info'] - Importance level
 */
async function logAudit(auditData) {
  const logEntry = {
    Timestamp: new Date().toISOString(),
    UserId: auditData.UserId || 'system',
    UserRole: auditData.UserRole || 'System',
    Action: auditData.Action,
    EntityType: auditData.EntityType,
    EntityId: auditData.EntityId,
    CaseId: auditData.CaseId || '',
    OldValue: auditData.OldValue ? JSON.stringify(auditData.OldValue) : null,
    NewValue: auditData.NewValue ? JSON.stringify(auditData.NewValue) : null,
    IpAddress: auditData.IpAddress || 'unknown',
    UserAgent: auditData.UserAgent || '',
    Description: auditData.Description,
    Severity: auditData.Severity || 'Info'
  };

  // Always log to file (fast, reliable)
  auditFileLogger.info('Audit Event', logEntry);

  // Also log to UiPath Data Service (async, non-blocking, fire-and-forget)
  if (auditEnabled && auditEntityName) {
    setImmediate(async () => {
      try {
        const auditEntity = await getEntityInstance(auditEntityName);
        await auditEntity.insertRecord(logEntry);
      } catch (error) {
        // Never throw - audit logging is best-effort
        console.error('[Audit] UiPath logging failed:', error.message);
      }
    });
  }

  return logEntry;
}

/**
 * Express middleware that extracts request info for audit logging
 */
function extractAuditContext(req) {
  return {
    IpAddress: req.ip || req.connection.remoteAddress,
    UserAgent: req.get('user-agent') || '',
    UserId: req.session?.userId || req.body?.UserId || req.body?.borrowerId || 'anonymous',
    UserRole: req.session?.userRole || 'Unknown'
  };
}

/**
 * Get audit logs for a specific case
 * @param {string} caseId - The case ID to filter by
 * @returns {Promise<Array>} - Array of audit log entries
 */
async function getAuditLogsByCaseId(caseId) {
  try {
    const auditEntity = await getEntityInstance(auditEntityName);
    const response = await auditEntity.getAllRecords();
    
    return response.items
      .filter(record => record.CaseId === caseId)
      .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  } catch (error) {
    console.error('Error fetching audit logs from UiPath:', error.message);
    return [];
  }
}

module.exports = {
  logAudit,
  extractAuditContext,
  getAuditLogsByCaseId,
  auditFileLogger
};