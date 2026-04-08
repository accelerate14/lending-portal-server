const express = require("express");
const router = express.Router();
const upload = require("../../middleware/multer.middlerware");


/* ================= LOAN ================= */
const {
  submitLoanApplication,
  getLoanApplications,
  updateLoanStatus,
} = require("../../controller/lender/Loan/lenderloan.controller");
const { getLenderRoles } = require("../../controller/lender/Auth/lenderAuth.controller");
const { getAuditLogs } = require("../../controller/lender/Audit/auditLog.controller");

router.post("/loan/submit", submitLoanApplication);
router.get("/loans", getLoanApplications);
router.put("/loan/update-status/:loanId", updateLoanStatus);
router.get("/role/:email", getLenderRoles);

/* ================= AUDIT LOGS ================= */
router.get("/audit/:caseId", getAuditLogs);

module.exports = router;
