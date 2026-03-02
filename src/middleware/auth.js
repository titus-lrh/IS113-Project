// Authentication Middleware
// Handles user session verification and route protection

const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/login');
};

const isNotAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  return next();
};

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
};
