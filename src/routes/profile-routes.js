const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/edit/:id', userController.getEditProfileForm);
router.post('/update/:id', userController.updateProfile);
router.get('/:id', userController.getProfile);
router.post('/delete/:id', userController.deleteProfile);

module.exports = router;
