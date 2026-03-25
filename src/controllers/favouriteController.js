const Favourite = require('../models/favourite-model')

// CREATE - Add recipe to favorites
exports.addFavourite = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { recipeId, recipeTitle, recipeType } = req.body;

    // Check if already saved
    const alreadySaved = await Favourite.isFavourited(userId, recipeId);
    if (alreadySaved) {
      return res.status(400).json({ success: false, message: 'Already in favourites' });
    }

    // Save to database
    await Favourite.saveFavourite(userId, recipeId, recipeTitle, recipeType);
    res.json({ success: true, message: 'Saved to favourites' });
  } catch (error) {
    console.error('Error saving favourite:', error);
    res.status(500).json({ success: false, message: 'Error saving' });
  }
};

// READ - View all saved recipes
exports.viewFavourites = async (req, res) => {
  try {
    const userId = req.session.userId;

    // Get all favorites from database
    const favourites = await Favourite.getFavourites(userId);

    res.render('my-favourites', { favourites, session: req.session });
  } catch (error) {
    console.error('Error getting favourites:', error);
    res.status(500).send('Error getting favourites');
  }
};

// READ - Get single favorite (API endpoint)
exports.getSingleFavourite = async (req, res) => {
  try {
    const { favouriteId } = req.params;
    const favourite = await Favourite.getFavouriteById(favouriteId);

    if (!favourite) {
      return res.status(404).json({ success: false, message: 'Favourite not found' });
    }

    res.json({ success: true, favourite });
  } catch (error) {
    console.error('Error getting favourite:', error);
    res.status(500).json({ success: false, message: 'Error getting favourite' });
  }
};

// UPDATE - Update a favorite
exports.updateFavouriteName = async (req, res) => {
  try {
    const { favouriteId } = req.params;
    const { recipeTitle } = req.body;

    const updatedFavourite = await Favourite.updateFavourite(favouriteId, { recipeTitle });

    if (!updatedFavourite) {
      return res.status(404).json({ success: false, message: 'Favourite not found' });
    }

    res.json({ success: true, message: 'Favourite updated', favourite: updatedFavourite });
  } catch (error) {
    console.error('Error updating favourite:', error);
    res.status(500).json({ success: false, message: 'Error updating favourite' });
  }
};


// DELETE - Remove favorite by ID
exports.deleteFavouriteById = async (req, res) => {
  try {
    const { favouriteId } = req.params;

    const result = await Favourite.removeFavouriteById(favouriteId);

    if (!result) {
      return res.status(404).json({ success: false, message: 'Favourite not found' });
    }

    res.json({ success: true, message: 'Favourite removed' });
  } catch (error) {
    console.error('Error removing favourite:', error);
    res.status(500).json({ success: false, message: 'Error removing favourite' });
  }
};
