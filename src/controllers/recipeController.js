const Recipe = require('../models/recipe-model');
const FoodNutrition = require('../models/FoodNutrition');
const nutritionService = require('../services/nutritionService');

// Validation helper
function validateRecipeBody(body) {
  const errors = [];
  if (!body.title || body.title.trim().length < 3)
    errors.push({ msg: 'Title must be at least 3 characters' });
  if (!body.description || !body.description.trim())
    errors.push({ msg: 'Description is required' });
  const ct = parseInt(body.cookingTime);
  if (!ct || ct < 1)
    errors.push({ msg: 'Cooking time must be a positive number' });
  const sv = parseInt(body.servings);
  if (!sv || sv < 1)
    errors.push({ msg: 'Servings must be a positive number' });
  return errors;
}

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


// GET all recipes
const getAllRecipes = async (req, res) => {
  try {
    const recipes = await Recipe.getAllRecipes();
    recipes.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const mealdbMeals = await fetchFromMealDB('https://www.themealdb.com/api/json/v1/1/filter.php?c=Chicken');
    const mealdbRecipes = mealdbMeals.slice(0, 12);
    res.render('recipes/index', { recipes, mealdbRecipes, currentPage: 'recipes', session: req.session });
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).send('Error fetching recipes');
  }
};

// GET user's own recipes
const getMyRecipes = async (req, res) => {
  try {
    const recipes = await Recipe.getRecipesByUser(req.params.userId);
    res.render('recipes/userRecipe', { recipes, currentPage: 'my-recipes', session: req.session });
  } catch (error) {
    console.error('Error fetching uploaded recipes by user:', error);
    res.status(500).send('Error fetching uploaded recipes by user');
  }
};

// GET recipe creation form
const getNewRecipeForm = (req, res) => {
  res.render('recipes/new', { errors: [], body: {}, session: req.session });
};

// POST create recipe
const createRecipe = async (req, res) => {
  const errors = validateRecipeBody(req.body);
  if (errors.length > 0) {
    return res.status(400).render('recipes/new', { errors, body: req.body });
  }

  try {
    const { title, description, ingredients, instructions, cookingTime, servings, category } = req.body;
    let formatCategory = Array.isArray(category) ? category : [category]

    if(formatCategory.length < 1) {
      return res.status(400).render('recipes/new', { errors: [{ msg: 'Please select at least 1 category!' }], body: req.body });
    }
    else if(formatCategory.length > 3) {
      return res.status(400).render('recipes/new', { errors: [{ msg: 'Please select max 3 categories!' }], body: req.body });
    }

    if(title.includes("`")) {
      return res.status(400).render('recipes/new', { errors: [{ msg: 'Backticks (`) are not allowed in title!' }], body: req.body });
    }

    const ingredientArray = Array.isArray(ingredients) ? ingredients : ingredients.split(',').map(i => i.trim());

    const newRecipe = await Recipe.createRecipe({
      title,
      description,
      ingredients: ingredientArray,
      instructions,
      cookingTime: parseInt(cookingTime),
      servings: parseInt(servings),
      category: formatCategory,
      author: req.session.userId,
    });

    // Fire-and-forget: index nutrition in background so future food log lookups hit cache
    nutritionService.getNutrition(
      'user_recipe',
      newRecipe._id.toString(),
      title,
      `Ingredients: ${ingredientArray.join(', ')}`
    ).catch((err) => console.error('Nutrition index failed:', err));

    const recipes = await Recipe.getRecipesByUser(req.session.userId);
    res.render('recipes/userRecipe', { recipes, session: req.session });
  } catch (error) {
    console.error('Error creating recipe:', error);
    res.status(500).render('recipes/new', { errors: [{ msg: 'Error creating recipe' }] });
  }
};

// GET single recipe
const getRecipe = async (req, res) => {
  try {
    const from = req.query.from;    
    const recipe = await Recipe.getRecipeById(req.params.id);    
    if (!recipe) {
      return res.status(404).send('Recipe no longer exist');
    }
    res.render('recipes/show', { 
    recipe,
    session: req.session,
    from
});
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).send('Error fetching recipe');
  }
};

// GET edit form
const getEditRecipeForm = async (req, res) => {
  try {
    const recipe = await Recipe.getRecipeById(req.params.id);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    if (recipe.author._id.toString() !== req.session.userId) {
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
  const errors = validateRecipeBody(req.body);
  if (errors.length > 0) {
    const recipe = await Recipe.getRecipeById(req.params.id);
    return res.status(400).render('recipes/edit', { errors, recipe });
  }

  try {
    const recipe = await Recipe.getRecipeById(req.params.id);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }
    if (recipe.author._id.toString() !== req.session.userId) {
      return res.status(403).send('Unauthorized');
    }

    const { title, description, ingredients, instructions, cookingTime, servings, category } = req.body;

    const ingredientArray = Array.isArray(ingredients)
      ? ingredients
      : ingredients.split(',').map(i => i.trim());

    const updateData = {
      title,
      description,
      ingredients: ingredientArray,
      instructions,
      cookingTime: parseInt(cookingTime),
      servings: parseInt(servings),
      category
    };

    const updatedRecipe = await Recipe.updateRecipeById(req.params.id, updateData);

    // Fire-and-forget: delete old nutrition and re-index with fresh data
    if (updatedRecipe) {
      (async () => {
        try {
          // Delete old nutrition record for this recipe
          await FoodNutrition.deleteBySourceId('user_recipe', updatedRecipe._id.toString());
          // Fetch fresh nutrition based on updated ingredients
          await nutritionService.getNutrition(
            'user_recipe',
            updatedRecipe._id.toString(),
            updatedRecipe.title,
            `Ingredients: ${updatedRecipe.ingredients.join(', ')}`
          );
        } catch (err) {
          console.error('Nutrition re-index failed:', err);
        }
      })();
    }

    res.redirect(`/recipes/${req.params.id}`);
  } catch (error) {
    console.error('Error updating recipe:', error);
    res.status(500).send('Error updating recipe');
  }
};

// DELETE recipe
const deleteRecipe = async (req, res) => {
  try {
    const recipe = await Recipe.getRecipeById(req.params.id);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }

    const isOwner = recipe.author._id.toString() === req.session.userId;
    const isAdmin = req.session.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).send('Unauthorized');
    }

    await Recipe.deleteRecipeById(req.params.id);
    res.redirect('/recipes');
  } catch (error) {
    console.error('Error deleting recipe:', error);
    res.status(500).send('Error deleting recipe');
  }
};

// GET search results (user recipes + MealDB)
const searchRecipes = async (req, res) => {
  const query = req.query.q || '';
  try {
    const userRecipes = await Recipe.searchRecipesByTitle(query);

    const mealdbMeals = await fetchFromMealDB(
      `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`
    );

    res.render('recipes/search', { userRecipes, mealdbRecipes: mealdbMeals, query, session: req.session });
  } catch (error) {
    console.error('Error searching recipes:', error);
    res.status(500).send('Error searching recipes');
  }
};

//Get rating of recipe(Tim & Isaac)
const rateRecipe = async (req, res) => {
  try {
    console.log("RATE ROUTE HIT");
    console.log("Rating received:", req.body.rating);

    const recipeId = req.params.id;
    const userId = req.session.userId;
    const rating = parseInt(req.body.rating);

    const recipe = await Recipe.getRecipeById(recipeId);

    if (!recipe) {
      return res.status(404).send("Recipe not found");
    }

    // prevent duplicate rating
    if (recipe.ratedUsers?.includes(userId)) {
      return res.send("You already rated this recipe");
    }

    const newCount = (recipe.ratingCount || 0) + 1;
    const newRating =
      ((recipe.rating || 0) * (recipe.ratingCount || 0) + rating) / newCount;

    await Recipe.updateRecipeById(recipeId, {
      rating: newRating,
      ratingCount: newCount,
    });
    
    await Recipe.addRatedUser(recipeId, userId);

    const updatedRecipe = await Recipe.getRecipeById(recipeId);

    console.log("UPDATED:", updatedRecipe.rating, updatedRecipe.ratingCount);

    res.render('recipes/show', {
      recipe: updatedRecipe,
      session: req.session
    });

  } catch (error) {
    console.error("Error rating recipe:", error);
    res.status(500).send("Error rating recipe");
  }
};

// Add comment
const addComment = async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  const comment = {
    user: req.session.userId,
    username: req.session.username,
    text
  };

  await Recipe.addComment(id, comment);
  res.redirect(`/recipes/${id}`);
};

// Delete comment
const deleteComment = async (req, res) => {
  const { id, commentId } = req.params;
  await Recipe.deleteComment(id, commentId);
  res.redirect(`/recipes/${id}`);
};

// Edit comment
const editComment = async (req, res) => {
  const { id, commentId } = req.params;
  const { text } = req.body;

  await Recipe.editComment(id, commentId, text);
  res.redirect(`/recipes/${id}`);
};

// Like comment
const likeComment = async (req, res) => {
  const { id, commentId } = req.params;
  const userId = req.session.userId;

  await Recipe.likeComment(id, commentId, userId);
  res.redirect(`/recipes/${id}`);
};



// GET single MealDB recipe
const getMealDBRecipe = async (req, res) => {
  try {
    const from = req.query.from;
    const meals = await fetchFromMealDB(
      `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${req.params.id}`
    );
    if (!meals.length) {
      return res.status(404).send('Recipe not found');
    }
    const recipe = transformMealDetail(meals[0]);
    res.render('recipes/mealdb-show', { recipe, session: req.session, from });
  } catch (error) {
    console.error('Error fetching MealDB recipe:', error);
    res.status(500).send('Error fetching recipe');
  }
};

// Shared GPT summarize helper
const generateSummary = async (recipeData) => {
  const ingredients = Array.isArray(recipeData.ingredients)
    ? recipeData.ingredients.join(', ')
    : recipeData.ingredients;

  const prompt = `Summarize this recipe in 3–4 friendly sentences. Mention the key ingredients, cooking time (if known), and what makes it special.

Recipe: ${recipeData.title}
${recipeData.description ? `Description: ${recipeData.description}` : ''}
${recipeData.cookingTime ? `Cooking time: ${recipeData.cookingTime} minutes` : ''}
${recipeData.servings ? `Servings: ${recipeData.servings}` : ''}
Ingredients: ${ingredients}
Instructions: ${recipeData.instructions}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env['GPT-SECRET']}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error('OpenAI error:', err);
    throw new Error('Failed to get summary from AI');
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
};

// POST /recipes/:id/summarize — community recipes
const summarizeRecipe = async (req, res) => {
  try {
    const recipe = await Recipe.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).send('Recipe not found');
    const summary = await generateSummary(recipe);
    res.render('recipes/show', { recipe, session: req.session, summary });
  } catch (error) {
    console.error('Error summarizing recipe:', error);
    res.status(500).send('Error summarizing recipe');
  }
};

// POST /recipes/mealdb/:id/summarize — stock MealDB recipes
const summarizeMealDBRecipe = async (req, res) => {
  try {
    const meals = await fetchFromMealDB(
      `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${req.params.id}`
    );
    if (!meals.length) return res.status(404).send('Recipe not found');
    const recipe = transformMealDetail(meals[0]);
    const summary = await generateSummary(recipe);
    res.render('recipes/mealdb-show', { recipe, session: req.session, summary });
  } catch (error) {
    console.error('Error summarizing MealDB recipe:', error);
    res.status(500).send('Error summarizing recipe');
  }
};


module.exports = {
  getAllRecipes,
  getMyRecipes,
  getNewRecipeForm,
  createRecipe,
  getRecipe,
  getEditRecipeForm,
  updateRecipe,
  deleteRecipe,
  searchRecipes,
  getMealDBRecipe,
  rateRecipe,
  summarizeRecipe,
  summarizeMealDBRecipe,
  addComment,
  deleteComment,
  editComment,
  likeComment
};
