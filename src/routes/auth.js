// Authentication Routes
// Handles user registration, login, and logout

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAuthenticated, isNotAuthenticated } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Validation rules for registration
const registerValidationRules = () => {
  return [
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Invalid email format'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
  ];
};

// Register endpoint
router.post('/register', isNotAuthenticated, registerValidationRules(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('register', { errors: errors.array() });
  }

  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).render('register', { errors: [{ msg: 'User already exists' }] });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      firstName,
      lastName,
    });

    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).render('register', { errors: [{ msg: 'Server error' }] });
  }
});

// Login endpoint
router.post('/login', isNotAuthenticated, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).render('login', { errors: [{ msg: 'Username and password required' }] });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).render('login', { errors: [{ msg: 'Invalid credentials' }] });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).render('login', { errors: [{ msg: 'Invalid credentials' }] });
    }

    req.session.userId = user._id;
    req.session.username = user.username;

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('login', { errors: [{ msg: 'Server error' }] });
  }
});

// Logout endpoint
router.get('/logout', isAuthenticated, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Logout failed');
    }
    res.redirect('/');
  });
});

module.exports = router;
