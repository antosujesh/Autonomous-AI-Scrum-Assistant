const session = require('express-session');
const bcrypt = require('bcrypt');

/**
 * Returns the express-session middleware configured for the app.
 */
function sessionMiddleware() {
    return session({
        secret: process.env.SESSION_SECRET || 'followup-ai-secret-2025',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
    });
}

/**
 * Express middleware — redirects unauthenticated users to /login.
 * Only protects UI page routes (not API endpoints).
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.redirect('/login');
}

/**
 * Hash a plain-text password.
 */
async function hashPassword(plain) {
    return bcrypt.hash(plain, 10);
}

/**
 * Verify a plain-text password against a stored hash.
 */
async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

module.exports = { sessionMiddleware, requireAuth, hashPassword, verifyPassword };
