const mongoose = require('mongoose');

const favouriteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  recipeId: {
    type: String,
    required: [true, "Favourite recipe must have an ID"]
  },
  recipeTitle: {
    type: String,
    required: [true, "Favourite recipe must have a Title"]
  },
  recipeType: {
    type: String,
    required: [true, "Recipe must have an author/by meal DB"]
  },
  savedAt: {
    type: Date,
    default: Date.now,
  },
});

// Prevent saving same recipe twice
favouriteSchema.index({ userId: 1, recipeId: 1 }, { unique: true });

const Favourite = mongoose.model('Favourite', favouriteSchema);

// CREATE - Save a recipe to favourites
exports.saveFavourite = async (userId, recipeId, recipeTitle, recipeType) => {
  const favourite = new Favourite({
    userId,
    recipeId,
    recipeTitle,
    recipeType,
  });
  await favourite.save();
  return favourite;
};

// READ - Get all favourites for a user
exports.getFavourites = async (userId) => {
  return await Favourite.find({ userId }).sort({ savedAt: -1 });
};

exports.getFavouriteById = async (userId, favouriteId) => {
  return await Favourite.findOne({ _id: favouriteId, userId });
}

// UPDATE - Update a favorite (e.g., update recipeTitle)
exports.updateFavourite = async (userId, favouriteId, updateData) => {
  return await Favourite.findOneAndUpdate({ _id: favouriteId, userId }, updateData, { new: true });
};

// DELETE - Remove favorite by ID
exports.removeFavouriteById = async (userId, favouriteId) => {
  return await Favourite.findOneAndDelete({ _id: favouriteId, userId });
};

// Check if already favorited
exports.isFavourited = async (userId, recipeId) => {
  const result = await Favourite.findOne({ userId, recipeId });
  return result ? true : false;
};
