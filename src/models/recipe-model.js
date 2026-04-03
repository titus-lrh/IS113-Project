// Recipe Model (Example Data Model)
// This is an example schema for a recipe management application
// Adjust fields based on your chosen project scenario

const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    minlength: 3,
  },
  description: {
    type: String,
    required: true,
  },
  ingredients: {
    type: [String],
    required: true,
  },
  instructions: {
    type: String,
    required: true,
  },
  cookingTime: {
    type: Number,
    required: true, // in minutes
  },
  servings: {
    type: Number,
    required: true,
  },
  category: {
    type: [],
    default: 'meal',
  }, 
  image: {
    type: String,
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    default: 0, //store the average rating value of the recipe
  },
  ratingCount: {
    type: Number,
    default: 0, //store how many users have rated this recipe
  },
  ratedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', //stored userIDs to prevent duplicate
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  //stores all comments related to a recipe
  comments: [
  {
    //user who posted the comment
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String, //for display
    text: String, //comment content
    createdAt: { //timestamp
      type: Date,
      default: Date.now
    },
    likes: { //number of likes on th
      type: Number,
      default: 0
    },
    likedUsers: [ //stores users who liked the comment
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  }
],
});

// Index for better query performance
recipeSchema.index({ author: 1, category: 1 });

const Recipe = mongoose.model('Recipe', recipeSchema);

// GET All Recipe
exports.getAllRecipes = async () => {
  return await Recipe.find().populate('author', 'username firstName lastName');
};

exports.getRecipeSuggestionCandidates = async (limit = 60) => {
  return await Recipe.find({}, '_id title')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// GET User's Recipe
exports.getRecipesByUser = async (userId) => {
  return await Recipe.find({ author: userId }).populate('author', 'username firstName lastName');
};


// Create a new recipe
exports.createRecipe = async (recipeData) => {
  const recipe = new Recipe(recipeData);
  await recipe.save();
  return recipe;
};

// GET a single recipe by ID
exports.getRecipeById = async (id) => {
  return await Recipe.findById(id).populate('author', 'username firstName lastName');
};

// UPDATE Recipe by ID
exports.updateRecipeById = async (id, updateData) => {
  return await Recipe.findByIdAndUpdate(id, { ...updateData, updatedAt: Date.now() }, { new: true });
};

// DELETE Recipe by ID
exports.deleteRecipeById = async (id) => {
  return await Recipe.findByIdAndDelete(id);
};

// Search recipes by title (case-insensitive)
exports.searchRecipesByTitle = async (query) => {
  return await Recipe.find({
    title: { $regex: query, $options: 'i' }
  }).populate('author', 'username firstName lastName');
};

exports.searchRecipeTitles = async (query, limit = 12) => {
  return await Recipe.find(
    { title: { $regex: query, $options: 'i' } },
    '_id title'
  )
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// Add a user to the list of people who rated
exports.addRatedUser = async (id, userId) => {
  return await Recipe.findByIdAndUpdate(id, {
    $push: { ratedUsers: userId }
  });
};

// Add comment
exports.addComment = async (recipeId, commentData) => {
  return await Recipe.findByIdAndUpdate(
    recipeId,
    { $push: { comments: commentData } },
    { returnDocument: 'after' }
  );
};

//  Delete comment, removes a specific comment
exports.deleteComment = async (recipeId, commentId) => {
  return await Recipe.findByIdAndUpdate(
    recipeId,
    { $pull: { comments: { _id: commentId } } },
    { returnDocument: 'after' }
  );
};

// Edit comment- updates the text to the new one
exports.editComment = async (recipeId, commentId, text) => {
  return await Recipe.findOneAndUpdate(
    { _id: recipeId, "comments._id": commentId },
    { $set: { "comments.$.text": text } },
    { returnDocument: 'after' }
  );
};

// Like comment- increase heart icon count
exports.likeComment = async (recipeId, commentId, userId) => {
  const recipe = await Recipe.findById(recipeId);
  const comment = recipe.comments.id(commentId);

  if (!comment) return;

  const alreadyLiked = (comment.likedUsers || []).some(
    u => u.toString() === userId
  );

  if (alreadyLiked) return;

  comment.likes += 1;
  comment.likedUsers.push(userId);

  await recipe.save();
};
