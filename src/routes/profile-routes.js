const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/edit/:id', isAuthenticated, userController.getEditProfileForm);
router.post('/update/:id', isAuthenticated, userController.updateProfile);
router.get('/:id', isAuthenticated, userController.getProfile);
router.post('/delete/:id', isAuthenticated, userController.deleteProfile);

module.exports = router;
