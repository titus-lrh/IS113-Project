// Main Server File
// Entry point for the IS113 Group Project

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const recipeRoutes = require('./routes/recipes');
const profileRoutes = require("./routes/profile");
const methodOverride = require('method-override');


require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(methodOverride('_method'));

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Body Parser Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.urlencoded({ extended: true }));

// View Engine
app.set('view engine', 'ejs');
app.set('views', 'views');

// Session Configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true,
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
app.use("/", recipeRoutes);
app.use('/auth', authRoutes);
app.use("/profile", profileRoutes);
app.use("/recipes", recipeRoutes);



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
