// Main Server File
// Entry point for the IS113 Group Project

const express = require('express');
const session = require('express-session');
const path = require('path');
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth-routes');
const recipeRoutes = require('./routes/recipes-routes');
const profileRoutes = require("./routes/profile-routes");
const foodlogRoutes = require('./routes/foodlog-routes');
const favouriteRoutes = require('./routes/favourite-routes');
const groceryRoutes = require('./routes/grocery-routes');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

app.get('/favicon.ico', (req, res) => res.status(204));

// ============================================
// MIDDLEWARE SETUP
// ============================================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', 'views');

// Session Configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
};

app.use(session(sessionConfig));

// ============================================
// ROUTES
// ============================================

// Landing Page
app.get('/', (_req, res) => res.redirect('/recipes'));
app.get('/index.html', (_req, res) => res.redirect('/recipes'));
app.use('/auth', authRoutes);
app.use("/profile", profileRoutes);
app.use("/recipes", recipeRoutes);
app.use("/schedule", foodlogRoutes);
app.use("/favourites", favouriteRoutes);
app.use("/groceries", groceryRoutes);


// ============================================
// ERROR HANDLING
// ============================================

// 404 Handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal server error');
});

// ============================================
// DATABASE & SERVER STARTUP
// ============================================

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start Express Server
    app.listen(PORT, () => {
      console.log(`\n✓ Server is running on http://localhost:${PORT}`);
      console.log('✓ Navigate to http://localhost:8000/ to get started\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
