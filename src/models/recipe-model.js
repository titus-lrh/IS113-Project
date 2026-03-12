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
    type: String,
    enum: ['vegan', 'dessert', 'quick-meals', 'breakfast', 'lunch', 'dinner', 'snack'],
    default: 'meal',
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
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

module.exports = mongoose.model('Recipe', recipeSchema);
