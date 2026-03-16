const User = require('../models/user-model');
const Recipe = require('../models/recipe-model');
const { body, validationResult } = require('express-validator');

const registerValidationRules = () => {
  return [
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Invalid email format'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
  ];
};

// GET login form
const getLoginForm = (req, res) => {
  res.render('login');
};

// GET register form
const getRegisterForm = (req, res) => {
  res.render('register');
};

// GET dashboard
const getDashboard = (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  res.render('dashboard', { user: req.session });
};

// POST register
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('register', { errors: errors.array() });
  }

  try {
    const { username, email, password, firstName, lastName } = req.body;

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).render('register', { errors: [{ msg: 'User already exists' }] });
    }

    const user = new User({ username, email, password, firstName, lastName });
    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;

    res.redirect('/auth/dashboard');
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).render('register', { errors: [{ msg: 'Server error' }] });
  }
};

// POST login
const login = async (req, res) => {
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

    res.redirect('/auth/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('login', { errors: [{ msg: 'Server error' }] });
  }
};

// GET logout
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Logout failed');
    }
    res.redirect('/');
  });
};

// GET edit profile form
const getEditProfileForm = async (req, res) => {
  const user = await User.findById(req.params.id);
  res.render('editProfile', { user });
};

// POST update profile
const updateProfile = async (req, res) => {
  const { username, email, bio } = req.body;
  await User.findByIdAndUpdate(
    req.params.id,
    { $set: { username, email, bio } },
    { new: true }
  );
  res.redirect('/profile/' + req.params.id);
};

// GET profile
const getProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send('User not found');
    }

    const recipes = await Recipe.find({ authorId: userId }).sort({ createdAt: -1 });

    res.render('profile', { user, recipes });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

// POST delete profile
const deleteProfile = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/');
};

module.exports = {
  registerValidationRules,
  getLoginForm,
  getRegisterForm,
  getDashboard,
  register,
  login,
  logout,
  getEditProfileForm,
  updateProfile,
  getProfile,
  deleteProfile,
};
