const axios = require("axios");
const FormData = require("form-data");
const { getEntityInstance, entitiesService } = require("../../../utils/uipath");
const { logAudit, extractAuditContext } = require("../../../utils/auditLogger");

// Use the cleaned up Base URL
const BASE_API_URL = process.env.UIPATH_TOKEN_URL;
const DATA_FABRIC_TOKEN = process.env.UIPATH_TOKEN_SECRET;
const DOCUMENT_ENTITY = process.env.UIPATH_BDOCUMENT_ENTITY_NAME;
const loanEntityName = process.env.UIPATH_BLOAN_ENTITY_NAME;

// DocuSeal Configuration
const DOCUSEAL_API_URL = process.env.DOCUSEAL_API_URL || "https://api.docuseal.com";
const DOCUSEAL_BASE_URL = process.env.DOCUSEAL_BASE_URL || "https://docuseal.com";

// UiPath Transaction Entity
const TRANSACTION_ENTITY = process.env.UIPATH_TRANSACTION_ENTITY || "FLCMAgreementTransactions";

// Case Status Values
const CASE_STATUS_SUBMITTED = process.env.CASE_STATUS_SUBMITTED || "Submitted";
const CASE_STATUS_AGREEMENT_SIGNED_BORROWER = process.env.CASE_STATUS_AGREEMENT_SIGNED_BORROWER || "Agreement Signed by Borrower";
const CASE_STATUS_AGREEMENT_SIGNED_UNDERWRITER = process.env.CASE_STATUS_AGREEMENT_SIGNED_UNDERWRITER || "Agreement Signed by Underwriter";

// Polling Configuration
const DOCUSEAL_POLL_ATTEMPTS = parseInt(process.env.DOCUSEAL_POLL_ATTEMPTS) || 10;
const DOCUSEAL_POLL_INTERVAL_MS = parseInt(process.env.DOCUSEAL_POLL_INTERVAL_MS) || 2000;

module.exports.uploadBorrowerDocuments = async (req, res) => {
    try {
        const { UserId, CaseNumber } = req.body;

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ success: false, message: "No files uploaded" });
        }

        // STEP 1: Insert record
        const insertUrl = `${BASE_API_URL}/${DOCUMENT_ENTITY}/insert`;

        const createResponse = await axios.post(
            insertUrl,
            { UserId: UserId, CaseNumber: CaseNumber },
            {
                headers: {
                    Authorization: `Bearer ${DATA_FABRIC_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const recordId = createResponse.data.Id;
        const files = req.files;

        // STEP 2: Upload Files
        const uploadPromises = [];

        // Upload Driver's License if exists
        if (files?.DriversLicense?.[0]) {
            uploadPromises.push(
                uploadFileToUiPath(recordId, "DriversLicense", files.DriversLicense[0])
            );
        }

        // Upload Pay Stub if exists
        if (files?.PayStub?.[0]) {
            uploadPromises.push(
                uploadFileToUiPath(recordId, "PayStub", files.PayStub[0])
            );
        }

        // Note: ProfilePicture logic has been removed from here

        await Promise.all(uploadPromises);

        const loanEntityMetadata = await getEntityInstance(loanEntityName);
        console.log("Loan entity metadata:", loanEntityMetadata);

        const loanRecords = await entitiesService.getAllRecords(loanEntityMetadata.id);
        console.log(`All loans retrieved:`, loanRecords);

        const targetLoan = loanRecords.items.find(r => r.CaseId === CaseNumber);
        console.log(`Target loan for CaseNumber ${CaseNumber}:`, targetLoan);

        if (targetLoan) {
            await entitiesService.updateRecordsById(loanEntityMetadata.id, [
                {
                    id: targetLoan.Id,
                    CaseStatus: CASE_STATUS_SUBMITTED,
                    DocumentsStorageRecord: recordId
                }
            ]);
            console.log(`Loan ${CaseNumber} status updated to: Submitted, DocumentsStorageRecord linked: ${recordId}`);
        }

        // Audit log
        const auditContext = extractAuditContext(req);
        logAudit({
            UserId: UserId,
            UserRole: 'Borrower',
            Action: 'DocumentUploaded',
            EntityType: 'Document',
            EntityId: recordId,
            CaseId: CaseNumber,
            NewValue: { DocumentsUploaded: Object.keys(req.files) },
            IpAddress: auditContext.IpAddress,
            UserAgent: auditContext.UserAgent,
            Description: `Borrower uploaded documents: ${Object.keys(req.files).join(', ')}`,
            Severity: 'Info'
        });

        return res.status(200).json({
            success: true,
            uipathId: recordId
        });

    } catch (err) {
        if (err.response) {
            console.error("UiPath Error Data:", err.response.data);
        }
        console.error("DETAILED ERROR:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

async function uploadFileToUiPath(recordId, fieldName, fileObject) {
    const form = new FormData();
    form.append("file", fileObject.buffer, {
        filename: fileObject.originalname,
        contentType: fileObject.mimetype,
    });

    const cleanBaseUrl = process.env.UIPATH_TOKEN_URL.split('/EntityService')[0];
    const attachmentUrl = `${cleanBaseUrl}/Attachment/${DOCUMENT_ENTITY}/${recordId}/${fieldName}`;

    return axios.post(
        attachmentUrl,
        form,
        {
            headers: {
                ...form.getHeaders(),
                Authorization: `Bearer ${process.env.UIPATH_TOKEN_SECRET}`,
            },
        }
    );
}

module.exports.getBorrowerDocuments = async (req, res) => {
    try {
        const { caseId } = req.params;

        const queryUrl = `${BASE_API_URL}/${DOCUMENT_ENTITY}/query`;

        const queryResponse = await axios.post(
            queryUrl,
            {
                // 1. Ensure the filter is robust
                filter: `CaseNumber eq '${caseId}'`,
                // 2. Sort by UpdateTime descending to get the newest first
                orderby: "UpdateTime desc",
                top: 1
            },
            {
                headers: {
                    Authorization: `Bearer ${DATA_FABRIC_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        // Instead of just taking [0], let's explicitly find the match in the array 
        // as a backup in case the API filter underperforms
        const record = queryResponse.data.value.find(r => r.CaseNumber === caseId);

        if (!record) {
            console.log(`No record found matching CaseNumber: ${caseId}`);
            return res.status(404).json({ success: false, message: "No documents found for this case" });
        }

        console.log("Correct Record Found:", record.Id);

        return res.status(200).json({
            success: true,
            data: {
                // Using the specific Internal Names confirmed in your logs
                DriversLicense: record.DriversLicense ? `/api/borrower/documents/file/${record.Id}/DriversLicense` : null,
                PayStub: record.PayStub ? `/api/borrower/documents/file/${record.Id}/PayStub` : null,
                LoanAgreement: record.LoanAgreement ? `/api/borrower/documents/file/${record.Id}/LoanAgreement` : null,
            }
        });

    } catch (err) {
        console.error("Fetch Doc Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};



module.exports.streamDocumentFile = async (req, res) => {
    try {
        const { recordId, fieldName } = req.params;
        const cleanBaseUrl = process.env.UIPATH_TOKEN_URL.split('/EntityService')[0];

        const downloadUrl = `${cleanBaseUrl}/Attachment/${DOCUMENT_ENTITY}/${recordId}/${fieldName}`;

        const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            headers: {
                Authorization: `Bearer ${DATA_FABRIC_TOKEN}`,
            }
        });

        response.data.pipe(res);
    } catch (err) {
        res.status(500).send("Error streaming file");
    }
};

// Add this to your existing documents controller file

module.exports.uploadLoanAgreement = async (req, res) => {
    try {
        const { CaseNumber } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        // STEP 1: Find existing document record for this case
        const queryUrl = `${BASE_API_URL}/${DOCUMENT_ENTITY}/query`;
        const queryResponse = await axios.post(
            queryUrl,
            {
                filter: `CaseNumber eq '${CaseNumber}'`,
                orderby: "UpdateTime desc",
                top: 1
            },
            {
                headers: {
                    Authorization: `Bearer ${DATA_FABRIC_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        let recordId;
        const existing = queryResponse.data.value?.find(r => r.CaseNumber === CaseNumber);

        if (existing) {
            // Use existing record
            recordId = existing.Id;
        } else {
            return res.status(404).json({ success: false, message: "No existing document record found for this case. Please upload initial documents first." });
        }

        // STEP 2: Upload LoanAgreement file
        await uploadFileToUiPath(recordId, "LoanAgreement", req.file);

        const loanEntityMetadata = await getEntityInstance(loanEntityName);

        // 2. Actually FETCH the records from Data Service
        const loanRecordsResponse = await entitiesService.getAllRecords(loanEntityMetadata.id);
        const loanRecords = loanRecordsResponse.items || []; // Ensure it's an array

        // 3. Now you can use .find() on the array of items
        const targetLoan = loanRecords.find(r => r.CaseId === CaseNumber);

        if (!targetLoan) {
            console.error("Loan not found for CaseNumber:", CaseNumber);
            return res.status(404).json({ success: false, message: "No loan found for this case number" });
        }

        const loanId = targetLoan.Id;
        console.log("Loan ID found for CaseNumber", CaseNumber, "is", loanId);

        // 4. Update the record using the metadata ID and the specific record ID
        await entitiesService.updateRecordsById(loanEntityMetadata.id, [{
            id: loanId,
            CaseStatus: CASE_STATUS_AGREEMENT_SIGNED_BORROWER
        }]);

        // Audit log
        const auditContext = extractAuditContext(req);
        logAudit({
            UserId: req.session?.userId || 'unknown',
            UserRole: 'Borrower',
            Action: 'LoanAgreementUploaded',
            EntityType: 'Document',
            EntityId: recordId,
            CaseId: CaseNumber,
            NewValue: { CaseStatus: CASE_STATUS_AGREEMENT_SIGNED_BORROWER },
            IpAddress: auditContext.IpAddress,
            UserAgent: auditContext.UserAgent,
            Description: `Borrower uploaded loan agreement for case ${CaseNumber}`,
            Severity: 'Info'
        });

        return res.status(200).json({
            success: true,
            message: "Loan agreement uploaded successfully",
            recordId
        });

    } catch (err) {
        if (err.response) {
            console.error("UiPath Error:", err.response.data);
        }
        console.error("Upload Agreement Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports.createSigningSubmission = async (req, res) => {
        try {
                const { loanId, email, name, amount, address, phone, rate, term, monthlyPayment, totalAmount, caseId, underwriterName } = req.body;

                // Helper function to extract name from email format
                const extractNameFromEmail = (value) => {
                        if (!value) return "Lender";
                        // If it looks like an email, extract the name part
                        if (value.includes("@")) {
                                const namePart = value.split("@")[0];
                                // Replace dots and underscores with spaces, then capitalize each word
                                return namePart
                                        .replace(/[._-]/g, " ")
                                        .replace(/\b\w/g, (char) => char.toUpperCase());
                        }
                        // If not email format, return as-is (already a name)
                        return value;
                };

                const processedLenderName = extractNameFromEmail(underwriterName);

                const response = await fetch(`${DOCUSEAL_API_URL}/submissions`, {
                        method: "POST",
                        headers: {
                                "X-Auth-Token": process.env.DOCUSEAL_API_KEY,
                                "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                                template_id: process.env.DOCUSEAL_TEMPLATE_ID,
                                send_email: false,
                                submitters: [
                                        {
                                                role: "Borrower",
                                                email: email,
                                                name: name,
                                                external_id: loanId, // unique per loan
                                                fields: [
                                                        { name: "fullname", default_value: name },
                                                        { name: "address", default_value: address },
                                                        { name: "phone", default_value: phone },
                                                        { name: "amount", default_value: amount },
                                                        { name: "rate", default_value: rate },
                                                        { name: "term", default_value: term },
                                                        { name: "name", default_value: name },
                                                        { name: "monthlyPayment", default_value: monthlyPayment },
                                                        { name: "totalAmount", default_value: totalAmount },
                                                        { name: "caseId", default_value: caseId },
                                                        { name: "date", default_value: new Date().toLocaleDateString() },
                                                ],
                                        },
                                        {
                                                role: "Lender",
                                                name: processedLenderName,
                                                fields: [
                                                        { name: "lenderdate", default_value: new Date().toLocaleDateString() },
                                                ],
                                        }
                                ]
                        }),
                });

        const data = await response.json();
        console.log("DocuSeal submission response:", data);
        const slug = data?.[0]?.slug;
        console.log(`DocuSeal slug for loan ${loanId}:`, slug);
        if (!slug) {
            console.error("DocuSeal error:", data);
            return res.status(500).json({ success: false, message: "Failed to create submission" });
        }

        const submissionId = data?.[0]?.submission_id;

        console.log(`Submission ID for loan ${loanId}:`, submissionId);

        if (submissionId) {
            await axios.post(
                `${process.env.UIPATH_TOKEN_URL}/${TRANSACTION_ENTITY}/insert`,
                {
                    CaseId: caseId,
                    SubmissionId: String(submissionId),
                    DocumentUrl: `${DOCUSEAL_BASE_URL}/s/${slug}`
                },
                {
                    headers: { Authorization: `Bearer ${process.env.UIPATH_TOKEN_SECRET}` }
                }
            );
        }

        // Audit log
        const auditContext = extractAuditContext(req);
        logAudit({
            UserId: req.session?.userId || email || 'unknown',
            UserRole: 'Borrower',
            Action: 'SigningSessionCreated',
            EntityType: 'Agreement',
            EntityId: loanId,
            CaseId: caseId,
            NewValue: { SubmissionId: String(submissionId), DocumentUrl: `${DOCUSEAL_BASE_URL}/s/${slug}` },
            IpAddress: auditContext.IpAddress,
            UserAgent: auditContext.UserAgent,
            Description: `DocuSeal signing session created for loan ${loanId}, case ${caseId}`,
            Severity: 'Info'
        });

        return res.status(200).json({
            success: true,
            url: `${DOCUSEAL_BASE_URL}/s/${slug}`
        });

    } catch (err) {
        console.error("DocuSeal submission error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
}


module.exports.getSignedDocument = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { data } = await axios.get(
            `${DOCUSEAL_API_URL}/submissions/${submissionId}`,
            { headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY } }
        );

        // 1. Try to get the fully signed version first
        let downloadUrl = data.combined_document_url;

        // 2. FALLBACK: If combined is not ready, get the Borrower's signed version
        if (!downloadUrl) {
            const borrower = data.submitters?.find(s => s.role === "Borrower");
            if (borrower && borrower.documents && borrower.documents.length > 0) {
                downloadUrl = borrower.documents[0].url;
                console.log("Combined not ready. Using Borrower's signed document.");
            }
        }

        if (!downloadUrl) {
            return res.status(404).json({ success: false, message: "No signed document available yet." });
        }

        const pdfResponse = await axios.get(downloadUrl, { responseType: "stream" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=loan_agreement_interim.pdf");
        pdfResponse.data.pipe(res);

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
}

module.exports.createLenderSigningSubmission = async (req, res) => {
    try {
        const { caseId } = req.body;
        // 1. Query the transactions entity to get the existing SubmissionId
        const queryUrl = `${process.env.UIPATH_TOKEN_URL}/${TRANSACTION_ENTITY}/query`;
        console.log(`Querying transaction for CaseId ${caseId} at URL: ${queryUrl}`);
        const queryResponse = await axios.post(
            queryUrl,
            {
                filter: `CaseId eq '${caseId}'`,
                top: 1
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.UIPATH_TOKEN_SECRET}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log(`Transaction query response for CaseId ${caseId}:`, queryResponse.data);

        const transaction = queryResponse.data.value?.find(t => t.CaseId === caseId);
        const submissionId = transaction?.SubmissionId;
        console.log(`Transaction query result for CaseId ${caseId}:`, transaction);

        if (!submissionId) {
            console.error(`No SubmissionId found for Case: ${caseId}`);
            return res.status(404).json({ 
                success: false, 
                message: "No active signing session found for this case." 
            });
        }

        // 2. Fetch the existing submission from DocuSeal to get the Lender's slug
        console.log(`Fetching DocuSeal submission for ID ${submissionId} to get lender slug` );
        const docusealRes = await axios.get(
            `${DOCUSEAL_API_URL}/submissions/${submissionId}`,
            {
                headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY }
            }
        );
        console.log(`DocuSeal submission data for ID ${submissionId}:`, docusealRes.data);


        // 3. Find the 'Lender' role in the submitters array
        console.log("Finding lender submitter in DocuSeal response for submission ID:", submissionId);
        const lenderData = docusealRes.data.submitters?.find(s => ["underwriter", "lender"].includes((s.role || "").toLowerCase()));
        console.log("DocuSeal submitters:", docusealRes.data.submitters);
        //const lenderData = docusealRes.data.submitters?.find(s => s.role === "Underwriter");
        console.log(`Lender data for submission ${submissionId}:`, lenderData);


        if (!lenderData || !lenderData.slug) {
            return res.status(404).json({ 
                success: false, 
                message: "Lender signing role not found in the original template." 
            });
        }

        // Audit log
        const auditContext = extractAuditContext(req);
        logAudit({
            UserId: req.session?.userId || 'unknown',
            UserRole: 'Lender',
            Action: 'LenderSigningSessionCreated',
            EntityType: 'Agreement',
            EntityId: submissionId,
            CaseId: caseId,
            NewValue: { LenderUrl: `${DOCUSEAL_BASE_URL}/s/${lenderData.slug}` },
            IpAddress: auditContext.IpAddress,
            UserAgent: auditContext.UserAgent,
            Description: `Lender signing session retrieved for case ${caseId}`,
            Severity: 'Info'
        });

        // 4. Return the slug for the frontend to render the DocuSeal form
        return res.status(200).json({
            success: true,
            url: `${DOCUSEAL_BASE_URL}/s/${lenderData.slug}`
        });

    } catch (err) {
        console.error("Lender Retrieval Error:", err.response?.data || err.message);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports.uploadLenderSignedAgreement = async (req, res) => {
    try {
        const { submissionId, CaseNumber } = req.body;

        // Poll DocuSeal until signed PDF is ready
        let downloadUrl = null;
        for (let i = 0; i < DOCUSEAL_POLL_ATTEMPTS; i++) {
            const { data } = await axios.get(
                `${DOCUSEAL_API_URL}/submissions/${submissionId}`,
                { headers: { "X-Auth-Token": process.env.DOCUSEAL_API_KEY } }
            );

            console.log(`Lender poll attempt ${i + 1}:`, data.documents?.[0]?.url);

            if (data.documents?.[0]?.url) {
                downloadUrl = data.documents[0].url;
                break;
            }
            await new Promise(r => setTimeout(r, DOCUSEAL_POLL_INTERVAL_MS));
        }

        if (!downloadUrl) {
            return res.status(404).json({ success: false, message: "Signed document not ready yet" });
        }

        // Download the signed PDF
        const pdfResponse = await axios.get(downloadUrl, { responseType: "arraybuffer" });
        const pdfBuffer = Buffer.from(pdfResponse.data);

        // Find existing document record
        const queryUrl = `${BASE_API_URL}/${DOCUMENT_ENTITY}/query`;
        const queryResponse = await axios.post(
            queryUrl,
            {
                filter: `CaseNumber eq '${CaseNumber}'`,
                orderby: "UpdateTime desc",
                top: 1
            },
            {
                headers: {
                    Authorization: `Bearer ${DATA_FABRIC_TOKEN}`,
                    "Content-Type": "application/json",
                }
            }
        );

        const existing = queryResponse.data.value?.find(r => r.CaseNumber === CaseNumber);
        if (!existing) {
            return res.status(404).json({ success: false, message: "No document record found for this case" });
        }

        // Upload signed PDF to Data Fabric under LoanAgreement field
        await uploadFileToUiPath(existing.Id, "LoanAgreement", {
            buffer: pdfBuffer,
            originalname: `loan_agreement_lender_signed_${CaseNumber}.pdf`,
            mimetype: "application/pdf"
        });

        // Update loan status to Agreement Approved
        const loanEntityMetadata = await getEntityInstance(loanEntityName);
        const loanRecordsResponse = await entitiesService.getAllRecords(loanEntityMetadata.id);
        const loanRecords = loanRecordsResponse.items || [];
        const targetLoan = loanRecords.find(r => r.CaseId === CaseNumber);

        if (!targetLoan) {
            return res.status(404).json({ success: false, message: "No loan found for this case number" });
        }

        await entitiesService.updateRecordsById(loanEntityMetadata.id, [{
            id: targetLoan.Id,
            CaseStatus: CASE_STATUS_AGREEMENT_SIGNED_UNDERWRITER
        }]);

        // Audit log
        const auditContext = extractAuditContext(req);
        logAudit({
            UserId: req.session?.userId || 'unknown',
            UserRole: 'Underwriter',
            Action: 'LenderAgreementUploaded',
            EntityType: 'Document',
            EntityId: existing.Id,
            CaseId: CaseNumber,
            OldValue: { CaseStatus: CASE_STATUS_AGREEMENT_SIGNED_BORROWER },
            NewValue: { CaseStatus: CASE_STATUS_AGREEMENT_SIGNED_UNDERWRITER },
            IpAddress: auditContext.IpAddress,
            UserAgent: auditContext.UserAgent,
            Description: `Lender uploaded signed agreement for case ${CaseNumber}, status updated to ${CASE_STATUS_AGREEMENT_SIGNED_UNDERWRITER}`,
            Severity: 'Critical'
        });

        return res.status(200).json({
            success: true,
            message: "Lender agreement signed and status updated to Agreement Signed by Underwriter"
        });

    } catch (err) {
        console.error("Lender upload agreement error:", err.response?.data || err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};