const Favourite = require("../models/favourite-model");

// CREATE - Add recipe to favourites
exports.addFavourite = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { recipeId, recipeTitle, recipeType, recipeImage } = req.body;

    // Check if already saved
    const alreadySaved = await Favourite.isFavourited(userId, recipeId);
    if (alreadySaved) {
      return res
        .status(400)
        .json({ success: false, message: "Already in favourites" });
    }

    // Save to database
    await Favourite.saveFavourite(userId, recipeId, recipeTitle, recipeType, recipeImage);
    res.json({ success: true, message: "Saved to favourites" });
  } catch (error) {
    console.error("Error saving favourite:", error);
    res.status(500).json({ success: false, message: "Error saving" });
  }
};

// READ - View all saved recipes
exports.viewFavourites = async (req, res) => {
  try {
    const userId = req.session.userId;

    // Get all favourites from database
    const favourites = await Favourite.getFavourites(userId);

    res.render("favourites/display-all", { favourites, session: req.session });
  } catch (error) {
    console.error("Error getting favourites:", error);
    res.status(500).send("Error getting favourites");
  }
};

// GET - EDIT FORM
exports.getEditForm = async (req, res) => {
  try {
    const { favouriteId } = req.params;
    const userId = req.session.userId;
    const favourite = await Favourite.getFavouriteById(userId, favouriteId);

    if (!favourite) {
      return res.status(404).send("Favourite not found");
    }

    res.render("favourites/edit", { favourite, session: req.session });
  } catch (error) {
    console.error("Error getting favourite: ", error);
    res.status(500).send("Error loading edit form");
  }
};

// UPDATE - Update a favourite
exports.updateFavouriteName = async (req, res) => {
  try {
    const { favouriteId } = req.params;
    const userId = req.session.userId;
    const { recipeTitle } = req.body;

    const updatedFavourite = await Favourite.updateFavourite(userId, favouriteId, { recipeTitle });

    if (!updatedFavourite) {
      return res.status(404).send("Favourite not found");
    }

    res.redirect("/favourites/my-favourites");
  } catch (error) {
    console.error("Error updating favourite:", error);
    res.status(500).send("Error updating favourite");
  }
};

// DELETE - Remove favourite by ID
exports.deleteFavouriteById = async (req, res) => {
  try {
    const { favouriteId } = req.params;
    const userId = req.session.userId;
    const result = await Favourite.removeFavouriteById(userId, favouriteId);

    if (!result) {
      return res.status(404).send("Favourite not found");
    }

    res.redirect("/favourites/my-favourites");
  } catch (error) {
    console.error("Error removing favourite:", error);
    res.status(500).send("Error removing favourite");
  }
};
