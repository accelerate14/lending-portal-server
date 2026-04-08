# Financial Lending Server

A Node.js/Express backend server for a financial lending platform that manages borrower and lender workflows, loan applications, document management, and digital signing via DocuSeal.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Installation & Setup](#installation--setup)
- [Production Deployment](#production-deployment)
- [API Documentation](#api-documentation)
  - [Borrower Routes](#borrower-routes)
  - [Lender Routes](#lender-routes)
  - [Audit Log Routes](#audit-log-routes)
- [Data Entities (UiPath Data Fabric)](#data-entities)
- [Middleware](#middleware)
- [Validation Schemas](#validation-schemas)
- [Document Signing Flow](#document-signing-flow)
- [Audit Logging](#audit-logging)
- [Security Features](#security-features)
- [Health Check](#health-check)

---

## Overview

This server acts as the backend for a financial lending application. It provides RESTful APIs for:

- **Borrower Management**: Registration, login, profile creation, employment info, loan applications
- **Lender Management**: Role-based access, loan review, status updates
- **Document Management**: Upload, storage, and retrieval via UiPath Data Fabric
- **Digital Signing**: Loan agreement signing via DocuSeal
- **Progress Tracking**: Multi-step wizard flow for borrower onboarding
- **Audit Logging**: Comprehensive audit trail for compliance and debugging

The server uses **UiPath Data Fabric** as the primary data store (no traditional database), leveraging the `@uipath/uipath-typescript` SDK for entity operations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│              (Financial Lending Portal)               │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST
┌──────────────────────────▼──────────────────────────────────┐
│                   Express Server (index.js)                  │
│                     Port: 8000 (default)                     │
├─────────────────────────────────────────────────────────────┤
│  Security Layer                                              │
│  ├── Helmet (HTTP security headers)                          │
│  ├── Rate Limiting (100 req/15min, 20 auth req/15min)        │
│  └── CORS (configurable allowed origins)                     │
├─────────────────────────────────────────────────────────────┤
│  Routes                                                       │
│  ├── /api/borrower/* (borrower.routes.js)                    │
│  └── /api/lender/* (lender.routes.js)                        │
├─────────────────────────────────────────────────────────────┤
│  Controllers                                                  │
│  ├── borrower/Auth, Profile, Employment, Loan,               │
│  │   Document, Progress, Stages                              │
│  └── lender/Auth, Loan, Audit                                 │
├─────────────────────────────────────────────────────────────┤
│  Services                                                     │
│  ├── UiPath Data Fabric (utils/uipath.js)                    │
│  ├── Audit Logger (utils/auditLogger.js)                     │
│  └── DocuSeal API (document signing)                         │
├─────────────────────────────────────────────────────────────┤
│  Logging                                                      │
│  ├── Winston (structured JSON logs)                          │
│  ├── logs/combined.log (all logs)                            │
│  ├── logs/error.log (errors only)                            │
│  └── logs/audit.log (audit trail)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js |
| Framework | Express.js v5.2.1 |
| Data Store | UiPath Data Fabric (via `@uipath/uipath-typescript`) |
| Authentication | JWT (`jsonwebtoken`) + bcryptjs |
| Validation | Joi v18 |
| File Upload | Multer v2 (memory storage) |
| Digital Signing | DocuSeal API |
| HTTP Client | Axios |
| Session Management | express-session |
| Environment | dotenv |
| CORS | cors |
| Security | helmet |
| Rate Limiting | express-rate-limit |
| Logging | winston |

---

## Project Structure

```
FinancialLendingServer/
├── index.js                          # Main entry point, Express app setup with security middleware
├── package.json                      # Dependencies and project metadata
├── .env                              # Environment variables (not in repo)
├── .gitignore                        # Git ignore rules
│
├── controller/
│   ├── borrower/
│   │   ├── Auth/
│   │   │   └── borrowerAuth.controller.js      # Login & Register
│   │   ├── Profile/
│   │   │   └── borrowerCrud.controller.js      # Profile CRUD
│   │   ├── Employment/
│   │   │   └── borrowerEmployment.controller.js # Employment info
│   │   ├── Loan/
│   │   │   └── borrowerLoan.controller.js      # Loan applications
│   │   ├── Document/
│   │   │   └── borrowerDocuments.controller.js # Document upload/download
│   │   └── Progress/
│   │       ├── borrowerProgress.controller.js  # Wizard progress tracking
│   │       └── borrowerStages.controller.js    # Stage management
│   │
│   └── lender/
│       ├── Auth/
│       │   └── lenderAuth.controller.js        # Lender role retrieval
│       ├── Loan/
│       │   └── lenderloan.controller.js        # Loan management & status updates
│       └── Audit/
│           └── auditLog.controller.js          # Audit log retrieval
│
├── routes/
│   ├── borrower/
│   │   └── borrower.routes.js         # All borrower API routes
│   └── lender/
│       └── lender.routes.js           # All lender API routes
│
├── middleware/
│   ├── multer.middlerware.js          # File upload configuration
│   ├── passport.middleware.js         # (Empty/placeholder)
│   └── validate.middleware.js         # Joi validation middleware
│
├── validations/
│   ├── auth.validation.js             # Login/Register schemas
│   ├── borrower.validation.js         # Profile validation schemas
│   ├── employment.validation.js       # Employment validation schemas
│   └── loan.validation.js             # Loan validation schemas
│
├── utils/
│   ├── uipath.js                      # UiPath SDK initialization & helpers
│   └── auditLogger.js                 # Audit logging utility
│
├── logs/                              # Application logs (auto-created)
│   ├── combined.log                   # All logs
│   ├── error.log                      # Error logs only
│   └── audit.log                      # Audit trail
│
└── uploads/                           # Local file storage (multer temp)
```

---

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server
PORT=8000
NODE_ENV=production
SESSION_SECRET=your_strong_random_secret_here

# Logging
LOG_LEVEL=info

# CORS (comma-separated origins)
ALLOWED_ORIGINS=https://yourfrontend.com,http://localhost:3000

# UiPath Data Fabric
UIPATH_BASE_URL=https://cloud.uipath.com
UIPATH_ORG_NAME=defaulttenant
UIPATH_TENANT_NAME=your_tenant_name
UIPATH_TOKEN_SECRET=your_uipath_token_secret
UIPATH_TOKEN_URL=https://cloud.uipath.com/your_org/your_tenant/dataservice_/api/EntityService
UIPATH_FOLDER_KEY=your_folder_key

# UiPath Entity Names
UIPATH_BAUTH_ENTITY_NAME=FLCM_BorrowerAuth
UIPATH_BPROFILE_ENTITY_NAME=FLCMPersonalInfo
UIPATH_BEMPLOYMENT_ENTITY_NAME=FLCMEmploymentData
UIPATH_BLOAN_ENTITY_NAME=FLCMLoanApplications
UIPATH_BDOCUMENT_ENTITY_NAME=FLCMDocumentStorage
UIPATH_BSTAGE_ENTITY_NAME=FLCMBorrowerStage
UIPATH_SUBMISSION_ENTITY_NAME=FLCMAgreementTransactions
UIPATH_ROLE_ENTITY_NAME=FLCM_LenderProfiles
UIPATH_AUDIT_LOG_ENTITY_NAME=FLCMAuditLog

# Audit Logging (set to 'false' to disable UiPath audit logging)
ENABLE_AUDIT_LOGGING=true

# Case Status Values
CASE_STATUS_SUBMITTED=Submitted
CASE_STATUS_AGREEMENT_SIGNED_BORROWER=Agreement Signed by Borrower
CASE_STATUS_AGREEMENT_SIGNED_UNDERWRITER=Agreement Signed by Underwriter

# DocuSeal (Primary signing)
DOCUSEAL_API_KEY=your_docuseal_api_key
DOCUSEAL_API_URL=https://api.docuseal.com
DOCUSEAL_BASE_URL=https://docuseal.com
DOCUSEAL_TEMPLATE_ID=your_docuseal_template_id

# DocuSeal Polling Configuration
DOCUSEAL_POLL_ATTEMPTS=10
DOCUSEAL_POLL_INTERVAL_MS=2000
```

---

## Installation & Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd FinancialLendingServer

# 2. Install dependencies
npm install

# 3. Create .env file with required variables (see above)

# 4. Start the server
node index.js

# Or with nodemon for development
npx nodemon index.js
```

The server will start on `http://127.0.0.1:8000` (or the PORT specified in .env).

---

## Production Deployment

### Pre-Deployment Checklist

1. **Environment Variables**: Set all production environment variables securely (use secrets manager)
2. **Session Secret**: Generate a strong random string for `SESSION_SECRET`
3. **CORS Origins**: Set `ALLOWED_ORIGINS` to your production frontend URL only
4. **HTTPS**: Deploy behind a reverse proxy (nginx, AWS ALB) with SSL/TLS
5. **Process Manager**: Use PM2 or similar for process management:
   ```bash
   npm install -g pm2
   pm2 start index.js --name financial-lending-server
   pm2 save
   pm2 startup
   ```
6. **Logs Directory**: Ensure `logs/` directory exists and is writable
7. **UiPath Entities**: Verify all entities exist in production UiPath:
   - `FLCMPersonalInfo`
   - `FLCMEmploymentData`
   - `FLCMLoanApplications`
   - `FLCMDocumentStorage`
   - `FLCMBorrowerStage`
   - `FLCMAgreementTransactions`
   - `FLCM_LenderProfiles`
   - `FLCMAuditLog` (create with schema below)

### Audit Log Entity Schema (FLCMAuditLog)

Create this entity in UiPath Data Service with these fields:

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Timestamp | DateTime | Yes | When the action occurred |
| UserId | String | Yes | Who performed the action |
| UserRole | String | Yes | Role (Borrower, Lender, Underwriter, Admin) |
| Action | String | Yes | Action performed |
| EntityType | String | Yes | Type of entity affected |
| EntityId | String | Yes | ID of affected record |
| CaseId | String | Yes | Loan case reference |
| OldValue | String | No | Previous state (JSON) |
| NewValue | String | No | New state (JSON) |
| IpAddress | String | Yes | User's IP address |
| UserAgent | String | No | Browser/device info |
| Description | String | Yes | Human-readable description |
| Severity | String | Yes | Info, Warning, Critical |

### Health Check

```bash
curl https://your-api-domain.com/health
```

Expected response:
```json
{
  "status": "Healthy",
  "uptime": 12345,
  "timestamp": "2026-04-06T01:00:00.000Z",
  "environment": "production",
  "version": "1.0.0"
}
```

---

## API Documentation

### Base URL

```
http://localhost:8000/api
```

---

### Borrower Routes

All borrower routes are prefixed with `/api/borrower`.

#### Authentication

| Method | Endpoint | Description | Validation |
|--------|----------|-------------|------------|
| POST | `/borrower/login` | User login | `loginSchema` |
| POST | `/borrower/register` | User registration | `registerSchema` |

#### Profile (Step 1)

| Method | Endpoint | Description | Validation |
|--------|----------|-------------|------------|
| POST | `/borrower/profile/submit` | Create/Update profile | `borrowerProfileSchema` |
| GET | `/borrower/profile/:borrowerId` | Get profile by ID | `getProfileSchema` |

#### Employment (Step 2)

| Method | Endpoint | Description | Validation |
|--------|----------|-------------|------------|
| POST | `/borrower/employment/submit` | Create/Update employment | `employmentInfoSchema` |
| GET | `/borrower/employment/:borrowerId` | Get employment by ID | `getEmploymentParamsSchema` |

#### Loan Application (Step 3)

| Method | Endpoint | Description | Validation |
|--------|----------|-------------|------------|
| POST | `/borrower/loan/submit` | Submit loan application | `loanSubmissionSchema` |
| GET | `/borrower/loans/:borrowerId` | Get all loans for borrower | `getLoanParamsSchema` |
| GET | `/borrower/loan/:loanId` | Get specific loan by ID | `getLoanByIdSchema` |

#### Document Management (Step 4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/borrower/documents/upload` | Upload documents (multipart) |
| GET | `/borrower/documents/:caseId` | Get documents for a case |
| GET | `/borrower/documents/file/:recordId/:fieldName` | Stream document file |
| POST | `/borrower/documents/upload-agreement` | Upload loan agreement |
| POST | `/borrower/documents/create-signing-submission` | Create DocuSeal signing session |
| GET | `/borrower/documents/signed-agreement/:submissionId` | Get signed document |
| POST | `/borrower/documents/create-lender-submission` | Create lender signing session |
| POST | `/borrower/documents/upload-lender-agreement` | Upload lender-signed agreement |

#### Progress & Stages (Step 5)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/borrower/progress/:borrowerId` | Get wizard progress |
| POST | `/borrower/stages/create-stage` | Create borrower stages |
| GET | `/borrower/stages/:borrowerId` | Get borrower stages |
| PUT | `/borrower/stages/update-stage/:borrowerId` | Update borrower stages |

---

### Lender Routes

All lender routes are prefixed with `/api/lender`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/lender/role/:email` | Get lender roles by email |
| POST | `/lender/loan/submit` | Submit/update loan application |
| GET | `/lender/loans` | Get all loan applications |
| PUT | `/lender/loan/update-status/:loanId` | Update loan status |
| GET | `/lender/audit/:caseId` | Get audit logs for a case |

#### Audit Log Routes

**GET /lender/audit/:caseId**

Returns the complete audit trail for a specific loan case.

```json
Response (200):
{
  "success": true,
  "caseId": "CASE-001",
  "logCount": 5,
  "logs": [
    {
      "Timestamp": "2026-04-06T02:00:00Z",
      "UserId": "lender@company.com",
      "UserRole": "Lender",
      "Action": "LoanStatusChanged",
      "EntityType": "Loan",
      "EntityId": "loan-uuid",
      "CaseId": "CASE-001",
      "OldValue": "{\"CaseStatus\": \"Draft\"}",
      "NewValue": "{\"CaseStatus\": \"Approved\"}",
      "IpAddress": "10.0.0.50",
      "Description": "Lender changed loan status from Draft to Approved",
      "Severity": "Critical"
    }
  ]
}
```

---

## Data Entities

The application uses UiPath Data Fabric entities as the data store:

| Entity Name | Purpose | Key Fields |
|-------------|---------|------------|
| `FLCM_BorrowerAuth` | User authentication | userId, emailAddress, password, isActive |
| `FLCMPersonalInfo` | Borrower profiles | UserId, FirstName, LastName, SSN, Address, etc. |
| `FLCMEmploymentData` | Employment information | UserId, EmploymentStatus, EmployerName, MonthlyIncome |
| `FLCMLoanApplications` | Loan applications | UserId, CaseId, LoanAmount, PurposeOfLoan, CaseStatus |
| `FLCMDocumentStorage` | Document metadata | UserId, CaseNumber, DriversLicense, PayStub, LoanAgreement |
| `FLCMBorrowerStage` | Borrower progress stages | borrowerId, stageName |
| `FLCMAgreementTransactions` | Signing transactions | CaseId, SubmissionId, DocumentUrl |
| `FLCM_LenderProfiles` | Lender roles | email, role[] |
| `FLCMAuditLog` | Audit trail | Timestamp, UserId, Action, CaseId, Description, Severity |

### Loan Status Flow

```
[Draft] → [Submitted] → [Agreement Signed by Borrower] → [Agreement Signed by Underwriter]
```

---

## Middleware

### 1. Helmet (`index.js`)
- Sets security HTTP headers
- Prevents XSS, clickjacking, MIME sniffing
- Content Security Policy disabled in development

### 2. Rate Limiting (`index.js`)
- General API: 100 requests per 15 minutes
- Auth endpoints: 20 requests per 15 minutes
- Returns 429 status when exceeded

### 3. CORS (`index.js`)
- Configurable via `ALLOWED_ORIGINS` env var
- Supports credentials
- Blocks unknown origins in production

### 4. Multer (`middleware/multer.middlerware.js`)
- Memory storage for file uploads
- 5MB file size limit
- Used for document uploads (Driver's License, Pay Stub, Loan Agreement)

### 5. Validate (`middleware/validate.middleware.js`)
- Joi schema validation middleware
- Validates `req.body`, `req.params`, or `req.query`
- Strips unknown fields
- Returns 400 with error messages on validation failure

---

## Validation Schemas

### Auth Validation (`validations/auth.validation.js`)
- **loginSchema**: email (valid email, required), password (required)
- **registerSchema**: email (valid email, required), password (min 8 chars, must contain letter + number)

### Borrower Validation (`validations/borrower.validation.js`)
- **borrowerProfileSchema**: Validates all profile fields including:
  - FirstName/LastName (letters only, 2-50 chars)
  - DateOfBirth (must be 18-80 years old)
  - SSN (9-digit format)
  - PhoneNumber (10-digit US format)
  - Address, City, State, ZipCode
  - Email, Unit, HighestDegree
  - UserId (required)

### Employment Validation (`validations/employment.validation.js`)
- **employmentInfoSchema**: Validates employment fields:
  - EmploymentStatus (Salaried/Self-Employed/Unemployed)
  - Conditional fields based on status
  - EmployerName, Address, City, State, ZipCode (required if employed)
  - YearsAtEmployer (1-60 for employed, 0-60 for unemployed)
  - MonthlyIncome (required for salaried)

### Loan Validation (`validations/loan.validation.js`)
- **loanSubmissionSchema**: Validates loan application:
  - UserId, PersonalInfo, EmploymentDetails (required)
  - RequestedOn (ISO date)
  - BorrowerEmail, RequesterEmailID (valid emails)
  - LoanAmount (1,000 - 10,000)
  - PurposeOfLoan (Personal/Education/Home/Business/Medical Loan)

---

## Document Signing Flow

### Primary Flow: DocuSeal

1. **Borrower Signs**:
   - Frontend calls `POST /borrower/documents/create-signing-submission`
   - Server creates DocuSeal submission with borrower details
   - Returns signing URL to frontend
   - Transaction saved to `FLCMAgreementTransactions` entity

2. **Lender Signs**:
   - Frontend calls `POST /borrower/documents/create-lender-submission`
   - Server retrieves existing submission from Data Fabric
   - Returns lender signing URL

3. **Document Retrieval**:
   - `GET /borrower/documents/signed-agreement/:submissionId`
   - Returns signed PDF (combined or borrower-only interim version)

4. **Final Upload**:
   - `POST /borrower/documents/upload-lender-agreement`
   - Downloads signed PDF from DocuSeal
   - Uploads to UiPath Data Fabric
   - Updates loan status to "Agreement Signed by Underwriter"

---

## Audit Logging

### Overview

The application includes comprehensive audit logging for compliance and security:

- **File-based logging**: All audit events written to `logs/audit.log`
- **UiPath logging**: Events also stored in `FLCMAuditLog` entity (optional)
- **Non-blocking**: Audit logging never slows down or breaks the main application

### Logged Events

| Event | Triggered By | Severity |
|-------|--------------|----------|
| LoanSubmitted | Borrower submits loan | Info |
| DocumentUploaded | Borrower uploads documents | Info |
| LoanStatusChanged | Lender updates loan status | Critical |

### Disable Audit Logging

To disable UiPath audit logging (file logging continues):

```env
ENABLE_AUDIT_LOGGING=false
```

### View Audit Logs

**Via API:**
```bash
GET /api/lender/audit/CASE-001
```

**Via File:**
```bash
cat logs/audit.log
```

---

## Security Features

### Implemented Security Measures

| Feature | Description |
|---------|-------------|
| **Helmet** | Security HTTP headers (XSS protection, content-type sniffing prevention) |
| **Rate Limiting** | Prevents brute-force attacks (100 req/15min general, 20 req/15min auth) |
| **CORS** | Restricts which domains can access the API |
| **HttpOnly Cookies** | Session cookies protected from XSS |
| **Request Size Limit** | 10MB max request body |
| **Input Validation** | Joi schemas validate all inputs |
| **Error Handling** | Generic error messages in production (no stack traces) |
| **Graceful Shutdown** | Handles SIGTERM, uncaught exceptions, unhandled rejections |

---

## Health Check

### GET /health

Returns server health status for monitoring and load balancers.

```json
Response (200):
{
  "status": "Healthy",
  "uptime": 12345,
  "timestamp": "2026-04-06T01:00:00.000Z",
  "environment": "production",
  "version": "1.0.0"
}
```

### GET /

Returns basic server information.

```json
Response (200):
{
  "status": "Financial Lending Server is running",
  "health": "/health",
  "api": {
    "borrower": "/api/borrower",
    "lender": "/api/lender"
  }
}
```

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": "Error description here"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (invalid credentials)
- `404`: Not Found
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

---

## Development Notes

1. **No Traditional Database**: All data is stored in UiPath Data Fabric entities
2. **JWT Authentication**: Tokens expire after 6 hours
3. **File Storage**: Files are stored in UiPath Data Fabric as attachments
4. **Session Management**: Uses express-session for token management
5. **CORS**: Configurable via `ALLOWED_ORIGINS` env var
6. **Password Security**: Passwords are hashed using bcryptjs with 10 salt rounds
7. **Audit Logging**: Fire-and-forget design - never blocks main operations
8. **Logging**: Winston structured logging with separate files for errors and audit

---

## License

ISC

---

## Author

Harshraj Mane - Lead developer
Shivansh Srivastav - Junior Developer