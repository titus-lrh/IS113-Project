const Grocery = require('../models/grocery-model');

// GET /groceries — show all items + empty form
exports.showAll = async (req, res) => {
    try {
        const groceryList = await Grocery.getAll(req.session.userId);
        res.render('groceries', { groceryList, editItem: null, error: null });
    } catch (error) {
        console.error('Error fetching grocery list:', error);
        res.status(500).render('error', { message: 'Error fetching grocery list' });
    }
};
 
// GET /groceries/:id/edit — show form pre-filled with item data
exports.showEditForm = async (req, res) => {
    try {
        const editItem = await Grocery.getById(req.params.id);
        const groceryList = await Grocery.getAll(req.session.userId);
        res.render('groceries', { groceryList, editItem, error: null });
    } catch (error) {
        console.error('Error fetching grocery item:', error);
        res.status(500).render('error', { message: 'Error fetching item' });
    }
};
 
// POST /groceries — create new item
exports.createItem = async (req, res) => {
    const { name, quantity, category, notes } = req.body;
 
    // validation
    if (!name || !quantity) {
        const groceryList = await Grocery.getAll();
        return res.render('groceries', {
            groceryList,
            editItem: null,
            error: 'Name and quantity are required.'
        });
    }
 
    try {
        await Grocery.createItem({ userId: req.session.userId, name, quantity, category, notes });
        res.redirect('/groceries');
    } catch (error) {
        console.error('Error creating grocery item:', error);
        res.status(500).render('error', { message: 'Error creating item' });
    }
};
 
// PUT /groceries/:id — update existing item
exports.updateItem = async (req, res) => {
    const { name, quantity, category, notes } = req.body;
 
    // validation
    if (!name || !quantity) {
        const groceryList = await Grocery.getAll();
        const editItem = await Grocery.getById(req.params.id);
        return res.render('groceries', {
            groceryList,
            editItem,
            error: 'Name and quantity are required.'
        });
    }
 
    try {
        await Grocery.updateItem(req.params.id, { name, quantity, category, notes });
        res.redirect('/groceries');
    } catch (error) {
        console.error('Error updating grocery item:', error);
        res.status(500).render('error', { message: 'Error updating item' });
    }
};
 
// DELETE /groceries/:id — delete item
exports.deleteItem = async (req, res) => {
    try {
        await Grocery.deleteItem(req.params.id);
        res.json({ msg: 'Item deleted successfully' });
    } catch (error) {
        console.error(error);
        res.json({ msg: 'Error deleting item' });
    }
};