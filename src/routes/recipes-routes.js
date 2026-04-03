// Recipe Routes (CRUD Operations Example)
// Handles Create, Read, Update, Delete operations for recipes

const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipeController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', recipeController.getAllRecipes);
router.get('/search', recipeController.searchRecipes);
router.get('/mealdb/:id', recipeController.getMealDBRecipe);
router.get('/my-recipes/:userId', recipeController.getMyRecipes);
router.get('/new', isAuthenticated, recipeController.getNewRecipeForm);

router.post('/', isAuthenticated, recipeController.createRecipe);
//submits a rating for recipe
router.post('/:id/rate', isAuthenticated, recipeController.rateRecipe);
//Adds a new comment to recipe
router.post('/:id/comment', isAuthenticated, recipeController.addComment);
//Deletes a specific comment
router.post('/:id/comment/:commentId/delete', isAuthenticated, recipeController.deleteComment);
//Edits a specific comment
router.post('/:id/comment/:commentId/edit', isAuthenticated, recipeController.editComment);
//likes a comment
router.post('/:id/comment/:commentId/like', isAuthenticated, recipeController.likeComment);
router.get('/:id', recipeController.getRecipe);
router.get('/:id/edit', isAuthenticated, recipeController.getEditRecipeForm);
router.post('/:id/update', isAuthenticated, recipeController.updateRecipe);
router.post('/:id/delete', isAuthenticated, recipeController.deleteRecipe);
router.post('/:id/summarize', recipeController.summarizeRecipe);
router.post('/mealdb/:id/summarize', recipeController.summarizeMealDBRecipe);




module.exports = router;
