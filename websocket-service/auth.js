const jwt = require('jsonwebtoken');
const SECRET = 'yourSecretKey';

const verifyToken = (token) => {
    return new Promise((resolve, reject) => {
        jwt.verify(token, SECRET, (err, decoded) => {
            if (err) return reject(new Error('Invalid token'));
            resolve(decoded);
        });
    });
};

module.exports = { verifyToken };
