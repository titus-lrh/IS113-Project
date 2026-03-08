// Authentication Middleware
// Handles user session verification and route protection

const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/auth/login');
};

const isNotAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/auth/dashboard');
  }
  return next();
};

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
};
