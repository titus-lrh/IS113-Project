// Recipe Routes (CRUD Operations Example)
// Handles Create, Read, Update, Delete operations for recipes

const express = require('express');
const router = express.Router();
const Recipe = require('../models/Recipe');
const { isAuthenticated } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Validation rules for recipe creation/update
const recipeValidationRules = () => {
  return [
    body('title').isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
    body('description').notEmpty().withMessage('Description is required'),
    body('cookingTime').isInt({ min: 1 }).withMessage('Cooking time must be a positive number'),
    body('servings').isInt({ min: 1 }).withMessage('Servings must be a positive number'),
  ];
};

// GET all recipes
router.get('/', async (req, res) => {
  // TODO: Team Member - Implement GET all recipes logic
  res.send('GET all recipes - To be implemented');
});

// GET recipes by category
router.get('/category/:category', async (req, res) => {
  // TODO: Team Member  - Implement GET recipes by category logic
  res.send(`GET recipes by category: ${req.params.category} - To be implemented`);
});

// GET recipe creation form
router.get('/new', isAuthenticated, (req, res) => {
  // TODO: Team Member - Implement GET recipe creation form logic (create and render new.ejs view)
  res.send('GET recipe creation form - To be implemented (Needs view)');
});

// POST create recipe
router.post('/', isAuthenticated, recipeValidationRules(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('recipes/new', { errors: errors.array() });
  }

  try {
    const { title, description, ingredients, instructions, cookingTime, servings, category } = req.body;

    // Parse ingredients if it's a string with commas
    const ingredientArray = Array.isArray(ingredients) ? ingredients : ingredients.split(',').map(i => i.trim());

    const recipe = new Recipe({
      title,
      description,
      ingredients: ingredientArray,
      instructions,
      cookingTime: parseInt(cookingTime),
      servings: parseInt(servings),
      category,
      author: req.session.userId,
    });

    await recipe.save();
    res.redirect(`/recipes/${recipe._id}`);
  } catch (error) {
    console.error('Error creating recipe:', error);
    res.status(500).render('recipes/new', { errors: [{ msg: 'Error creating recipe' }] });
  }
});

// GET single recipe
router.get('/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id).populate('author', 'username firstName lastName');
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    // Temporarily sending JSON for testing until the view is created by the team
    res.json({ msg: 'Recipe successfully created/fetched!', recipe });
    
    // TODO: Team member - Once the show.ejs view is created, remove res.json and uncomment the line below:
    // res.render('recipes/show', { recipe });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).send('Error fetching recipe');
  }
});

// GET edit form
router.get('/:id/edit', isAuthenticated, async (req, res) => {
  // TODO: Team Member - Implement GET edit form logic (create and render edit.ejs view)
  res.send(`GET edit form for recipe ID: ${req.params.id} - To be implemented (Needs view)`);
});

// PUT update recipe
router.put('/:id', isAuthenticated, recipeValidationRules(), async (req, res) => {
  // TODO: Team Member - Implement PUT update recipe logic
  res.send(`PUT update recipe ID: ${req.params.id} - To be implemented`);
});

// DELETE recipe
router.delete('/:id', isAuthenticated, async (req, res) => {
  // TODO: Team Member - Implement DELETE recipe logic
  res.send(`DELETE recipe ID: ${req.params.id} - To be implemented`);
});

module.exports = router;
