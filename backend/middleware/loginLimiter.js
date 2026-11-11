// ==========================================
// HYBRID RESERVE - ADMIN LOGIN RATE LIMITER
// ==========================================

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

const attemptsByClient = new Map();


// ==========================================
// CLIENT IDENTIFICATION
// ==========================================

function getClientKey(req) {

    // Do not trust arbitrary X-Forwarded-For headers.
    // Express trust proxy remains disabled by default.

    return req.ip ||
        req.socket?.remoteAddress ||
        "unknown-client";

}


// ==========================================
// REMOVE EXPIRED RECORDS
// ==========================================

function pruneExpired(now = Date.now()) {

    for (const [key, record] of attemptsByClient.entries()) {

        if (record.resetAt <= now) {
            attemptsByClient.delete(key);
        }

    }

}


// ==========================================
// LOGIN RATE LIMIT MIDDLEWARE
// ==========================================

function loginRateLimiter(req, res, next) {

    const now = Date.now();

    pruneExpired(now);

    const key = getClientKey(req);

    req.loginRateLimitKey = key;

    const record = attemptsByClient.get(key);

    if (
        record &&
        record.failedAttempts >= MAX_FAILED_ATTEMPTS
    ) {

        const retryAfter = Math.max(
            1,
            Math.ceil((record.resetAt - now) / 1000)
        );

        res.set("Retry-After", String(retryAfter));

        return res.status(429).json({

            success: false,

            message:
                `ลองเข้าสู่ระบบผิดพลาดหลายครั้งเกินไป ` +
                `กรุณารอประมาณ ${Math.ceil(retryAfter / 60)} นาทีแล้วลองใหม่`

        });

    }

    return next();

}


// ==========================================
// RECORD FAILED LOGIN
// ==========================================

function recordFailedLogin(req) {

    const now = Date.now();

    const key =
        req.loginRateLimitKey ||
        getClientKey(req);

    let record = attemptsByClient.get(key);

    if (!record || record.resetAt <= now) {

        record = {
            failedAttempts: 0,
            resetAt: now + WINDOW_MS
        };

    }

    record.failedAttempts += 1;

    attemptsByClient.set(key, record);

    return {

        failedAttempts: record.failedAttempts,

        maxFailedAttempts: MAX_FAILED_ATTEMPTS,

        resetAt: record.resetAt

    };

}


// ==========================================
// CLEAR FAILED LOGIN RECORDS
// ==========================================

function clearLoginFailures(req) {

    const key =
        req.loginRateLimitKey ||
        getClientKey(req);

    attemptsByClient.delete(key);

}


// ==========================================
// EXPORT
// ==========================================

module.exports = {

    loginRateLimiter,

    recordFailedLogin,

    clearLoginFailures

};