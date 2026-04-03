const User = require('../models/user-model');
const Recipe = require('../models/recipe-model');

// GET login form
const getLoginForm = (req, res) => {
  res.render('user/login');
};

// GET register form
const getRegisterForm = (req, res) => {
  res.render('user/register');
};

// GET dashboard
const getDashboard = (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  res.render('dashboard', {session: req.session });
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
    return res.status(400).render('user/register', { errors });
  }

  try {
    const existingUser = await User.findByUsernameOrEmail(username, email);
    if (existingUser) {
      return res.status(400).render('user/register', { errors: [{ msg: 'User already exists' }] });
    }

    // Create new user using the model function
    const user = await User.createUser({ username, email, password, firstName, lastName });
    
    // Set a session
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;

    res.redirect('/auth/dashboard');
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).render('user/register', { errors: [{ msg: 'Server error' }] });
  }
};

// POST login
const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).render('user/login', { errors: [{ msg: 'Username and password required' }] });
  }

  try {
    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).render('user/login', { errors: [{ msg: 'Invalid credentials' }] });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).render('user/login', { errors: [{ msg: 'Invalid credentials' }] });
    }

    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;

    const redirectTo = req.session.returnTo || '/auth/dashboard';
    delete req.session.returnTo;
    res.redirect(redirectTo);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('user/login', { errors: [{ msg: 'Server error' }] });
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
  if (!req.session.userId || req.session.userId.toString() !== req.params.id) {
    return res.status(403).send('Forbidden');
  }
  const user = await User.findByUserId(req.params.id);
  res.render('user/edit-profile', { user });
};

// POST update profile
const updateProfile = async (req, res) => {
  try {
    if (!req.session.userId || req.session.userId.toString() !== req.params.id) {
      return res.status(403).send('Forbidden');
    }
    const { firstName, lastName, username, email, bio, calorieGoal } = req.body;
    await User.updateProfile(req.params.id, { firstName, lastName, username, email, bio, calorieGoal });
    res.redirect('/profile/' + req.params.id);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).send('Server error');
  }
};

// GET profile
const getProfile = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findByUserId(userId);
    if (!user) {
      return res.status(404).send('User not found');
    }

    const recipes = await Recipe.getRecipesByUser(userId);

    res.render('user/display-profile', { user, recipes, session: req.session });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).send('Server error');
  }
};

// POST delete profile
const deleteProfile = async (req, res) => {
  try {
    if (!req.session.userId || req.session.userId.toString() !== req.params.id) {
      return res.status(403).send('Forbidden');
    }
    const userId = req.params.id;
    await User.deleteUser(userId);

    req.session.destroy((err) => {
      res.clearCookie('connect.sid');
      if (err) {
        console.error("Error clearing session:", err);
        return res.redirect('/profile');
      }
      res.redirect('/');
    });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).send("Could not delete profile.");
  }
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
