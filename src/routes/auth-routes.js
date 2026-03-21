// Authentication Routes
// Handles user registration, login, and logout

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isAuthenticated, isNotAuthenticated } = require('../middleware/auth');

router.get('/login', userController.getLoginForm);
router.get('/register', userController.getRegisterForm);
router.get('/dashboard', userController.getDashboard);
router.post('/register', isNotAuthenticated, userController.register);
router.post('/login', isNotAuthenticated, userController.login);
router.get('/logout', isAuthenticated, userController.logout);

module.exports = router;
