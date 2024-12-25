const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token, access denied' });
    }

    const verified = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = {
      _id: verified.userId, 
      ...verified
    };

    // // Debug log
    // console.log('Token payload:', verified);
    // console.log('User object:', req.user);

    if (!req.user._id) {
      return res.status(401).json({ error: 'Invalid user data in token' });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Token is invalid' });
  }
};

module.exports = auth;
