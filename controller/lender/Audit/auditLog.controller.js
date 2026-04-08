const { getAuditLogsByCaseId } = require("../../../utils/auditLogger");

/**
 * GET /api/lender/audit/:caseId
 * Returns audit logs for a specific loan case
 */
const getAuditLogs = async (req, res) => {
    try {
        const { caseId } = req.params;
        
        if (!caseId) {
            return res.status(400).json({ success: false, message: "Case ID is required" });
        }

        const logs = await getAuditLogsByCaseId(caseId);

        return res.status(200).json({
            success: true,
            caseId,
            logCount: logs.length,
            logs
        });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || "Internal Server Error" 
        });
    }
};

module.exports = { getAuditLogs };