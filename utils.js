/**
 * Multi-purpose utility functions for the Follow-up Agent
 */

/**
 * Normalizes a phone number to the international format required by WhatsApp.
 * Default country code is '91' (India).
 * @param {string|number} phone 
 * @returns {string} 
 */
function normalizePhone(phone) {
    if (!phone) return '';
    
    // Remove all non-digit characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // If it's 10 digits, add the 91 prefix
    if (cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }
    
    return cleaned;
}

module.exports = { normalizePhone };
