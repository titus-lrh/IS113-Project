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
  try {
    // find all recipes. populate() replaces ObjectId (author) with actual user document
    const recipes = await Recipe.find().populate('author', 'username firstName lastName');
    res.render('recipes/index', { recipes });
  } catch (error) {
    // error handling
    console.error('Error fetching recipes:', error);
    res.status(500).send('Error fetching recipes');
  }
});

// GET recipes by category
router.get('/category/:category', async (req, res) => {
  // TODO: Team Member  - Implement GET recipes by category logic
  try {
    // find recipes according to category
    const recipes = await Recipe.find({ category: req.params.category })
                                .populate('author', 'username firstName lastName');
    res.render('recipes/index', { recipes });
  } catch (error) {
    console.error('Error fetching recipes by category:', error);
    res.status(500).send('Error fetching recipes by category');
  }
});

// GET recipe creation form
router.get('/new', isAuthenticated, (req, res) => {
  // TODO: Team Member - Implement GET recipe creation form logic (create and render new.ejs view)
  res.render('recipes/new', { errors: [] });
});

// POST create recipe
router.post('/', isAuthenticated, recipeValidationRules(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // body is to store content that user types 
    return res.status(400).render('recipes/new', { errors: errors.array(), body: req.body });
  }

  try {
    const { title, description, ingredients, instructions, cookingTime, servings, category } = req.body;

    // parse ingredients if it's a string with commas
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
    
    // TODO: Team member - Once the show.ejs view is created, remove res.json and uncomment the line below:
    res.render('recipes/show', { recipe });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).send('Error fetching recipe');
  }
});

// GET edit form
router.get('/:id/edit', isAuthenticated, async (req, res) => {
  // TODO: Team Member - Implement GET edit form logic (create and render edit.ejs view)
  try {
    const recipe = await Recipe.findById(req.params.id);
    // no such recipe
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    // make sure only the author can edit
    if (recipe.author.toString() !== req.session.userId) {
      return res.status(403).send('Unauthorized');
    }
    res.render('recipes/edit', { recipe });
  } catch (error) {
    console.error('Error fetching recipe for edit:', error);
    res.status(500).send('Error fetching recipe');
  }});

// PUT update recipe
router.put('/:id', isAuthenticated, recipeValidationRules(), async (req, res) => {
  // TODO: Team Member - Implement PUT update recipe logic
  const errors = validationResult(req);
  // error found
  if (!errors.isEmpty()) {
    const recipe = await Recipe.findById(req.params.id);
    return res.status(400).render('recipes/edit', { errors: errors.array(), recipe });
  }

  try {
    // get recipe 
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    // make sure only the author can update
    if (recipe.author.toString() !== req.session.userId) {
      return res.status(403).send('Unauthorized');
    }

    const { title, description, ingredients, instructions, cookingTime, servings, category } = req.body;

    // convert to array if ingredients is passed as a string
    const ingredientArray = Array.isArray(ingredients) 
      ? ingredients 
      : ingredients.split(',').map(i => i.trim());

    // update recipe record
    await Recipe.findByIdAndUpdate(req.params.id, {
      title,
      description,
      ingredients: ingredientArray,
      instructions,
      cookingTime: parseInt(cookingTime),
      servings: parseInt(servings),
      category,
      updatedAt: Date.now()   // update timestamp
    });

    res.redirect(`/recipes/${req.params.id}`);
  } catch (error) {
    // error handling
    console.error('Error updating recipe:', error);
    res.status(500).send('Error updating recipe');
  }});

// DELETE recipe
router.delete('/:id', isAuthenticated, async (req, res) => {
  // TODO: Team Member - Implement DELETE recipe logic
  res.send(`DELETE recipe ID: ${req.params.id} - To be implemented`);
});

module.exports = router;
