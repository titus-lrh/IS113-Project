const express = require('express');
const router = express.Router();
const favouriteController = require('../controllers/favouriteController');

const { isAuthenticated } = require('../middleware/auth');

// CREATE - Add recipe to favorites
router.post('/add', isAuthenticated, favouriteController.addFavourite);

// READ - View all user's favorites
router.get('/my-favourites', isAuthenticated, favouriteController.viewFavourites);

// GET - Show edit form
router.get('/:favouriteId/edit', isAuthenticated, favouriteController.getEditForm)

// UPDATE - Update favorite name
router.post('/:favouriteId/edit', isAuthenticated, favouriteController.updateFavouriteName);

// DELETE - Remove by favorite ID
router.get('/:favouriteId/delete', isAuthenticated, favouriteController.deleteFavouriteById);

module.exports = router;
