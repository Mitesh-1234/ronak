const { z } = require('zod');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once, reused across warm invocations)
if (!admin.apps.length) {
    try {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined;

        if (process.env.FIREBASE_PROJECT_ID && privateKey) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
            console.log("✅ Firebase Admin initialized successfully");
        } else {
            console.error("❌ Missing required environment variables");
        }
    } catch (e) {
        console.error("❌ Firebase Auth error:", e.message);
    }
}

const db = admin.apps.length ? admin.firestore() : null;

// Zod validation schema
const rsvpSchema = z.object({
    first_name: z.string().min(1, 'First name is required').max(50).trim(),
    last_name: z.string().min(1, 'Last name is required').max(50).trim(),
    email: z.string().email('Invalid email address').trim(),
    phone: z.string().min(10, 'Phone must be at least 10 digits').max(15).trim(),
    is_attending: z.boolean(),
    guests: z.array(z.object({
        first_name: z.string().min(1).max(50).trim(),
        last_name: z.string().min(1).max(50).trim()
    })).optional().default([]),
    days_attending: z.array(z.enum(['day1', 'day2', 'day3'])).optional().default([]),
    message: z.string().max(1000).optional()
});

module.exports = async function handler(req, res) {
    // 1. SET CORS HEADERS FOR VERCEL
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // 2. HANDLE PREFLIGHT (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 3. ONLY ALLOW POST AFTER OPTIONS OVERRIDES
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not initialized. Check Vercel environment variables.' });
        }

        // Validate input
        const validatedData = rsvpSchema.parse(req.body);

        // Sanitize message removing any HTML tags natively
        const sanitizedMessage = validatedData.message ? validatedData.message.replace(/<[^>]*>?/gm, '') : '';

        // Generate RSVP ID
        const rsvp_id = 'RSVP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

        const safeData = {
            ...validatedData,
            message: sanitizedMessage,
            rsvp_id,
            created_at: new Date().toISOString()
        };

        // Save to Firestore
        await db.collection('guests').add(safeData);

        return res.status(200).json({
            success: true,
            message: 'RSVP successfully saved',
            rsvp_id
        });

    } catch (error) {
        console.error('RSVP Error:', error);

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Invalid input data',
                details: error.errors
            });
        }

        return res.status(500).json({ error: 'Server error while processing RSVP.' });
    }
}
