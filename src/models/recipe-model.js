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
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,

  rating: {
    type: Number,
    default: 0
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  ratedUsers: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User'
  }],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for better query performance
recipeSchema.index({ author: 1, category: 1 });

const Recipe = mongoose.model('Recipe', recipeSchema);

// GET All Recipe
exports.getAllRecipes = async () =>{
  return await Recipe.find().populate('author', 'username firstName lastName');
}


// GET User's Recipe
exports.getRecipesByUser = async (userId)=>{
  return await Recipe.find({ author: userId}).populate('author', 'username firstName lastName');
};

// GET Recipe by Category
exports.getRecipesByCategory = async (category)=>{
  return await Recipe.find({ category }).populate('author', 'username firstName lastName');
};


// Create a new recipe
exports.createRecipe = async (recipeData) =>{
  const recipe = new Recipe(recipeData);
  await recipe.save();
  return recipe;
}


// GET a single recipe by ID
exports.getRecipeById = async (id) =>{
  return await Recipe.findById(id).populate('author', 'username firstName lastName');
};


// UPDATE Recipe by ID
exports.updateRecipeById = async (id, updateData) =>{
  return await Recipe.findByIdAndUpdate(id, {...updateData, updatedAt: Date.now() }, { new: true });
};


//DELETE Recipe by ID
exports.deleteRecipeById = async (id) =>{
  return await Recipe.findByIdAndDelete(id);
};


// Search recipes by title (case-insensitive)
exports.searchRecipesByTitle = async (query) =>{
  return await Recipe.find({
    title: { $regex: query, $options: 'i' }
  }).populate('author', 'username firstName lastName');
}

// adds a user ino the list of people who rate
exports.addRatedUser = async (id, userId) => {
  return await Recipe.findByIdAndUpdate(id, {
    $push: { ratedUsers: userId }
  });
};

//Prevent duplicate ratings
ratedUsers: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User'
}]