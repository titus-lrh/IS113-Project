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
  recipeImage: {
    type: String,
    required: true,
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
exports.saveFavourite = async (userId, recipeId, recipeTitle, recipeType, recipeImage) => {
  const favourite = new Favourite({
    userId,
    recipeId,
    recipeTitle,
    recipeType,
    recipeImage
  });
  await favourite.save();
  return favourite;
};

// READ - Get all favourites for a user
exports.getFavourites = async (userId) => {
  return await Favourite.find({ userId }).sort({ savedAt: -1 });
};

exports.getFavouriteById = async (favouriteId) => {
  return await Favourite.findById(favouriteId)
}

// UPDATE - Update a favorite (e.g., update recipeTitle)
exports.updateFavourite = async (favouriteId, updateData) => {
  return await Favourite.findByIdAndUpdate(favouriteId, updateData, { new: true });
};

// DELETE - Remove favorite by ID
exports.removeFavouriteById = async (favouriteId) => {
  return await Favourite.findByIdAndDelete(favouriteId);
};

// Check if already favorited
exports.isFavourited = async (userId, recipeId) => {
  const result = await Favourite.findOne({ userId, recipeId });
  return result ? true : false;
};
