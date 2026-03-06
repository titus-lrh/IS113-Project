const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Recipe = require('../models/Recipe');

// GET edit profile page
router.get("/edit/:id", async (req, res) => {
    const user = await User.findById(req.params.id);
    res.render("editProfile", { user });
});

// UPDATE profile
router.post("/update/:id", async (req, res) => {
    console.log(req.body);
    const { username, email, bio } = req.body;
// findbyidandupdate is a mongodb function, await is to wait for the db to update before continuing
    await User.findByIdAndUpdate(
      //get userid
        req.params.id,
        //$set is to only update these specific fields
        { $set: { username, email, bio } },
        //return updated document
        { new: true }
    );

    res.redirect("/profile/" + req.params.id);
});

// READ profile
router.get("/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send('User not found');
    }

    const recipes = await Recipe.find({ authorId: userId })
      .sort({ createdAt: -1 });

    res.render('profile', { user, recipes });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// DELETE profile
router.post("/delete/:id", async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.redirect("/");
});

module.exports = router;