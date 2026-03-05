const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Recipe = require('../models/Recipe');

//Get route to show the edit page
router.get("/profile/edit/:id", async (req, res) => {

    const user = await User.findById(req.params.id);

    res.render("editProfile", { user });

});

//post to update prfoile to mongodb


router.post("/profile/update/:id", async (req, res) => {

    const { username, email, bio } = req.body;

    await User.findByIdAndUpdate(req.params.id, {
        username,
        email,
        bio
    });
//sends back to the user profile page instead of showing text using res.send
    res.redirect("/profile/" + req.params.id);

});


// READ USER PROFILE
router.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // 1️ Find user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send('User not found');
    }

    // 2️ Find all recipes by this user
    const recipes = await Recipe.find({ authorId: userId })
      .sort({ createdAt: -1 });

    // 3️ Render profile page
    res.render('profile', { user, recipes });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;