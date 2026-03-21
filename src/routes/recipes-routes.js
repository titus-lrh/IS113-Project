// Recipe Routes (CRUD Operations Example)
// Handles Create, Read, Update, Delete operations for recipes

const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipe-controller');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', recipeController.getAllRecipes);
router.get('/search', recipeController.searchRecipes);
router.get('/mealdb/:id', recipeController.getMealDBRecipe);
router.get('/my-recipes/:userId', recipeController.getMyRecipes);
router.get('/category/:category', recipeController.getRecipesByCategory);
router.get('/new', isAuthenticated, recipeController.getNewRecipeForm);
router.post('/', isAuthenticated, recipeController.createRecipe);
router.post('/:id/rate', isAuthenticated, recipeController.rateRecipe);
router.get('/:id', recipeController.getRecipe);
router.get('/:id/edit', isAuthenticated, recipeController.getEditRecipeForm);
router.post('/:id/update', isAuthenticated, recipeController.updateRecipe);
router.post('/:id/delete', isAuthenticated, recipeController.deleteRecipe);
router.post('/:id/summarize', recipeController.summarizeRecipe);


module.exports = router;
