// User Model
// Define user schema and authentication logic

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 50,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: /.+\@.+\..+/,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  calorieGoal: {
    type: Number,
    default: 3000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  bio: {
    type: String,
    required: false,
    maxlength: 200,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },

});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});
// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);


// CREATE USER
exports.createUser = async (userData) => {
  const { username, email, password, firstName, lastName } = userData;
  const user = new User({ username, email, password, firstName, lastName });
  await user.save();
  return user;
};

// READ - FIND USER BY USERNAME
exports.findByUsername = async (username) => {
  return await User.findOne({ username });
};

// READ - FIND USER BY USERNAME OR EMAIL
exports.findByUsernameOrEmail = async (username, email) => {
  return await User.findOne({ $or: [{ username }, { email }] });
};

// READ - FIND USER BY ID
exports.findByUserId = async (userId) => {
  return await User.findById(userId);
};

// UPDATE - UPDATE PROFILE
exports.updateProfile = async (userId, updateData) => {
  const { firstName, lastName, username, email, bio, calorieGoal } = updateData;
  const parsedGoal = Number(calorieGoal);
  return await User.findByIdAndUpdate(
    userId,
    { $set: { firstName, lastName, username, email, bio, calorieGoal: Number.isNaN(parsedGoal) ? 3000 : parsedGoal }},
    { new: true }
  );
};

// DELETE - DELETE USER BY ID
exports.deleteUser = async (userId) => {
  return await User.findByIdAndDelete(userId);
};
