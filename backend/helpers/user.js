const User = require('../models/user');

/**
 * Find user by Firebase authentication data
 * Checks firebaseUid first, then falls back to email
 * @param {Object} firebaseUser - Decoded Firebase token with uid and email
 * @returns {Promise<Object|null>} User document or null
 */
async function findUserByFirebaseAuth(firebaseUser) {
    if (!firebaseUser || !firebaseUser.uid) {
        return null;
    }

    let query = { firebaseUid: firebaseUser.uid };
    if (firebaseUser.email) {
        query = {
            $or: [
                { firebaseUid: firebaseUser.uid },
                { email: firebaseUser.email }
            ]
        };
    }
    return await User.findOne(query);
}

module.exports = {
    findUserByFirebaseAuth
};
