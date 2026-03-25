const express = require('express');
const router = express.Router();
const favouriteController = require('../controllers/favouriteController');

const { isAuthenticated } = require('../middleware/auth');

// CREATE - Add recipe to favorites
router.post('/add', isAuthenticated, favouriteController.addFavourite);

// READ - View all user's favorites
router.get('/my-favourites', isAuthenticated, favouriteController.viewFavourites);

// UPDATE - Update favorite name
router.put('/:favouriteId', isAuthenticated, favouriteController.updateFavouriteName);

// DELETE - Remove by favorite ID
router.delete('/:favouriteId', isAuthenticated, favouriteController.deleteFavouriteById);

module.exports = router;
