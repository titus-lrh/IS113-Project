const mongoose = require('mongoose');

const grocerySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Item must have a name']
    },
    quantity: {
        type: Number,
        required: [true, 'Item must have a quantity']
    },
    category: {
        type: String,
        enum: ['Dairy', 'Meat', 'Vegetables', 'Fruits', 'Beverages', 'Snacks', 'Others'],
        default: 'Others'
    },
    notes: {
        type: String,
        default: ''
    }
});

const Grocery = mongoose.model('Grocery', grocerySchema, 'groceries');

// GET all items for a user
exports.getAll = function (userId) {
    return Grocery.find({ userId });
};

// GET one item by ID
exports.getById = function (userId, id) {
    return Grocery.findOne({ _id: id, userId });
};

// CREATE new item
exports.createItem = function (data) {
    return Grocery.create(data);
};

// UPDATE item by ID
exports.updateItem = function (userId, id, data) {
    return Grocery.updateOne({ _id: id, userId }, { $set: data });
};

// DELETE item by ID
exports.deleteItem = function (userId, id) {
    return Grocery.deleteOne({ _id: id, userId });
};
