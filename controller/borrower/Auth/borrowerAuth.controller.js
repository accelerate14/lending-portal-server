const jwt = require('jsonwebtoken');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { getEntityInstance } = require('../../../utils/uipath');
const { logAudit, extractAuditContext } = require('../../../utils/auditLogger');

const entityName = process.env.UIPATH_BAUTH_ENTITY_NAME;

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const borrowerEntity = await getEntityInstance(entityName);
        
        // COMMENTED OUT: Old approach - fetch all records and filter in memory
        const recordsResponse = await borrowerEntity.getAllRecords();
        if (!recordsResponse || !recordsResponse.items) {
            return res.status(500).json({ message: 'Failed to retrieve records from UiPath' });
        }
        console.log('Records retrieved from UiPath:', recordsResponse);
        const user = recordsResponse.items.find(u => u.emailAddress === email);

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (user.isActive !== true) {
            return res.status(403).json({ message: 'Your account has been disabled. Please contact an administrator.' });
        }

        // NEW: Use SDK OData filtering - query records with filter at source
        // const recordsResponse = await borrowerEntity.getAllRecords({
        //     filter: `emailAddress eq '${email}' and isActive eq true`
        // });

        // if (!recordsResponse || !recordsResponse.items || recordsResponse.items.length === 0) {
        //     return res.status(401).json({ message: 'Invalid email or password' });
        // }

        // const user = recordsResponse.items[0];
        // console.log('Login attempt for email:', email, 'Found user:', user);

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const payload = { guid: user.userId.toString(), email: user.emailAddress };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '6h' });
        console.log('Login successful for user:', payload);

        // Audit log
        const auditContext = extractAuditContext(req);
        logAudit({
            UserId: user.userId,
            UserRole: 'Borrower',
            Action: 'UserLogin',
            EntityType: 'Auth',
            EntityId: '',
            CaseId: '',
            IpAddress: auditContext.IpAddress,
            UserAgent: auditContext.UserAgent,
            Description: `User logged in: ${email}`,
            Severity: 'Info'
        });

        return res.status(200).json({ message: 'User logged in successfully', token: token });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: error.message || 'Internal Server error' });
    }
};

const register = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const borrowerEntity = await getEntityInstance(entityName);

        // COMMENTED OUT: Old approach - insert immediately and catch uniqueness error
        // const hashedPassword = await bcrypt.hash(password, 10);
        // const newUser = {
        //     emailAddress: email,
        //     password: hashedPassword,
        //     isActive: true
        // };
        // const insertedRecord = await borrowerEntity.insertRecord(newUser);

        // NEW: Use SDK filtering to pre-check if email already exists before attempting insertion
        const existingUser = await borrowerEntity.getAllRecords({
            filter: `emailAddress eq '${email}'`
        });

        if (existingUser && existingUser.items && existingUser.items.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'This email is already registered. Please try another email.'
            });
        }

        // Hash password and insert new user
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            emailAddress: email,
            password: hashedPassword,
            isActive: true
        };

        const insertedRecord = await borrowerEntity.insertRecord(newUser);

        // Audit log
        const auditContext = extractAuditContext(req);
        logAudit({
            UserId: insertedRecord.userId,
            UserRole: 'Borrower',
            Action: 'UserRegister',
            EntityType: 'Auth',
            EntityId: insertedRecord.userId,
            CaseId: '',
            IpAddress: auditContext.IpAddress,
            UserAgent: auditContext.UserAgent,
            Description: `New user registered: ${email}`,
            Severity: 'Info'
        });

        const payload = { guid: insertedRecord.userId.toString(), email: insertedRecord.emailAddress };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '6h' });

        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token: token
        });

    } catch (error) {
        // Log the full error to your server console for debugging
        console.error('Registration error details:', error);

        // Handling the "Value uniqueness violation" error you shared earlier
        if (
            error.type === 'ValidationError' ||
            error.message?.includes('uniquely constrained') ||
            error.message?.includes('repeated value') ||
            error.statusCode === 400 // The SDK mapped status code
        ) {
            return res.status(400).json({
                success: false,
                message: 'This email is already registered. Please try another email.'
            });
        }

        // Generic fallback for other 500 errors
        return res.status(500).json({
            success: false,
            message: 'Registration failed due to a server error.'
        });
    }
};

module.exports = {
    login,
    register
};  