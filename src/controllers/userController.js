const User = require('../models/user-model');
const Recipe = require('../models/recipe-model');

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
  const { username, email, password, firstName, lastName } = req.body;
  const errors = [];

  if (!username || username.trim().length < 3)
    errors.push({ msg: 'Username must be at least 3 characters' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push({ msg: 'Invalid email format' });
  if (!password || password.length < 6)
    errors.push({ msg: 'Password must be at least 6 characters' });
  if (!firstName || !firstName.trim())
    errors.push({ msg: 'First name is required' });
  if (!lastName || !lastName.trim())
    errors.push({ msg: 'Last name is required' });

  if (errors.length > 0) {
    return res.status(400).render('register', { errors });
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

    const redirectTo = req.session.returnTo || '/auth/dashboard';
    delete req.session.returnTo;
    res.redirect(redirectTo);
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
    console.log('Fetching profile for userId:', userId);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send('User not found');
    }

    const recipes = await Recipe.getRecipesByUser(userId);
    console.log('Found recipes:', recipes.length);

    res.render('profile', { user, recipes });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).send('Server error');
  }
};

// POST delete profile
const deleteProfile = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/');
};

module.exports = {
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
