const Recipe = require('../models/recipe-model');
const { body, validationResult } = require('express-validator');

// ---- TheMealDB helpers ----
const fetchFromMealDB = async (url) => {
  const response = await fetch(url);
  const data = await response.json();
  return data.meals || [];
};

const transformMealDetail = (meal) => {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (ing && ing.trim()) {
      ingredients.push(`${measure ? measure.trim() + ' ' : ''}${ing.trim()}`);
    }
  }
  return {
    id: meal.idMeal,
    title: meal.strMeal,
    category: meal.strCategory,
    area: meal.strArea,
    ingredients,
    instructions: meal.strInstructions,
    thumbnail: meal.strMealThumb,
  };
};

const recipeValidationRules = () => {
  return [
    body('title').isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
    body('description').notEmpty().withMessage('Description is required'),
    body('cookingTime').isInt({ min: 1 }).withMessage('Cooking time must be a positive number'),
    body('servings').isInt({ min: 1 }).withMessage('Servings must be a positive number'),
  ];
};

// GET all recipes
const getAllRecipes = async (req, res) => {
  try {
    const recipes = await Recipe.find().populate('author', 'username firstName lastName');
    const mealdbMeals = await fetchFromMealDB('https://www.themealdb.com/api/json/v1/1/filter.php?c=Chicken');
    const mealdbRecipes = mealdbMeals.slice(0, 12);
    res.render('recipes/index', { recipes, mealdbRecipes, session: req.session });
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).send('Error fetching recipes');
  }
};

// GET user's own recipes
const getMyRecipes = async (req, res) => {
  try {
    const recipes = await Recipe.find({ author: req.params.userId }).populate('author', 'username firstName lastName');
    res.render('recipes/userRecipe', { recipes, session: req.session });
  } catch (error) {
    console.error('Error fetching uploaded recipes by user:', error);
    res.status(500).send('Error fetching uploaded recipes by user');
  }
};

// GET recipes by category
const getRecipesByCategory = async (req, res) => {
  try {
    const recipes = await Recipe.find({ category: req.params.category })
                                .populate('author', 'username firstName lastName');
    res.render('recipes/index', { recipes, session: req.session });
  } catch (error) {
    console.error('Error fetching recipes by category:', error);
    res.status(500).send('Error fetching recipes by category');
  }
};

// GET recipe creation form
const getNewRecipeForm = (req, res) => {
  res.render('recipes/new', { errors: [] });
};

// POST create recipe
const createRecipe = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('recipes/new', { errors: errors.array(), body: req.body });
  }

  try {
    const { title, description, ingredients, instructions, cookingTime, servings, category } = req.body;

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
    const recipes = await Recipe.find({ author: req.session.userId }).populate('author', 'username firstName lastName');
    res.render('recipes/userRecipe', { recipes, session: req.session });
  } catch (error) {
    console.error('Error creating recipe:', error);
    res.status(500).render('recipes/new', { errors: [{ msg: 'Error creating recipe' }] });
  }
};

// GET single recipe
const getRecipe = async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id).populate('author', 'username firstName lastName');
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    res.render('recipes/show', { recipe });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).send('Error fetching recipe');
  }
};

// GET edit form
const getEditRecipeForm = async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    if (recipe.author.toString() !== req.session.userId) {
      return res.status(403).send('Unauthorized');
    }
    res.render('recipes/edit', { recipe, session: req.session });
  } catch (error) {
    console.error('Error fetching recipe for edit:', error);
    res.status(500).send('Error fetching recipe');
  }
};

// PUT update recipe
const updateRecipe = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const recipe = await Recipe.findById(req.params.id);
    return res.status(400).render('recipes/edit', { errors: errors.array(), recipe });
  }

  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    if (recipe.author.toString() !== req.session.userId) {
      return res.status(403).send('Unauthorized');
    }

    const { title, description, ingredients, instructions, cookingTime, servings, category } = req.body;

    const ingredientArray = Array.isArray(ingredients)
      ? ingredients
      : ingredients.split(',').map(i => i.trim());

    await Recipe.findByIdAndUpdate(req.params.id, {
      title,
      description,
      ingredients: ingredientArray,
      instructions,
      cookingTime: parseInt(cookingTime),
      servings: parseInt(servings),
      category,
      updatedAt: Date.now()
    });

    res.redirect(`/recipes/${req.params.id}`);
  } catch (error) {
    console.error('Error updating recipe:', error);
    res.status(500).send('Error updating recipe');
  }
};

// DELETE recipe
const deleteRecipe = async (req, res) => {
  try {
    const recipe = await Recipe.deleteOne({ _id: req.params.id });
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    res.json({ msg: 'Recipe deleted successfully' });
  } catch (error) {
    console.error('Error deleting recipe:', error);
    res.status(500).send('Error deleting recipe');
  }
};

// GET search results (user recipes + MealDB)
const searchRecipes = async (req, res) => {
  const query = req.query.q || '';
  try {
    const userRecipes = await Recipe.find({
      title: { $regex: query, $options: 'i' }
    }).populate('author', 'username firstName lastName');

    const mealdbMeals = await fetchFromMealDB(
      `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`
    );

    res.render('recipes/search', { userRecipes, mealdbRecipes: mealdbMeals, query, session: req.session });
  } catch (error) {
    console.error('Error searching recipes:', error);
    res.status(500).send('Error searching recipes');
  }
};

// GET single MealDB recipe
const getMealDBRecipe = async (req, res) => {
  try {
    const meals = await fetchFromMealDB(
      `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${req.params.id}`
    );
    if (!meals.length) {
      return res.status(404).send('Recipe not found');
    }
    const recipe = transformMealDetail(meals[0]);
    res.render('recipes/mealdb-show', { recipe, session: req.session });
  } catch (error) {
    console.error('Error fetching MealDB recipe:', error);
    res.status(500).send('Error fetching recipe');
  }
};

module.exports = {
  recipeValidationRules,
  getAllRecipes,
  getMyRecipes,
  getRecipesByCategory,
  getNewRecipeForm,
  createRecipe,
  getRecipe,
  getEditRecipeForm,
  updateRecipe,
  deleteRecipe,
  searchRecipes,
  getMealDBRecipe,
};
