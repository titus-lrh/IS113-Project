const Grocery = require('../models/grocery-model');

// GET /groceries — show all items + empty form
exports.showAll = async (req, res) => {
    try {
        const groceryList = await Grocery.getAll(req.session.userId);
        res.render('groceries', { groceryList, editItem: null, error: null, session: req.session });
    } catch (error) {
        console.error('Error fetching grocery list:', error);
        res.status(500).render('error', { message: 'Error fetching grocery list' });
    }
};
 
// GET /groceries/:id/edit — show form pre-filled with item data
exports.showEditForm = async (req, res) => {
    try {
        const editItem = await Grocery.getById(req.session.userId, req.params.id);
        if (!editItem) {
            return res.status(404).render('error', { message: 'Item not found' });
        }
        const groceryList = await Grocery.getAll(req.session.userId);
        res.render('groceries', { groceryList, editItem, error: null, session: req.session });
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
        const groceryList = await Grocery.getAll(req.session.userId);
        return res.render('groceries', {
            groceryList,
            editItem: null,
            error: 'Name and quantity are required.',
            session: req.session,
        });
    } else if (name === " ") {
        const groceryList = await Grocery.getAll(req.session.userId);
        return res.render('groceries', {
            groceryList,
            editItem: null,
            error: 'Name cannot be empty!',
            session: req.session,
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
        const groceryList = await Grocery.getAll(req.session.userId);
        const editItem = await Grocery.getById(req.session.userId, req.params.id);
        return res.render('groceries', {
            groceryList,
            editItem,
            error: 'Name and quantity are required.',
            session: req.session,
        });
    }
 
    try {
        const result = await Grocery.updateItem(req.session.userId, req.params.id, { name, quantity, category, notes });
        if (result.matchedCount === 0) {
            return res.status(404).render('error', { message: 'Item not found' });
        }
        res.redirect('/groceries');
    } catch (error) {
        console.error(error);
        res.send("Error updating item");
    }
};
 
// DELETE /groceries/:id — delete item
exports.deleteItem = async (req, res) => {
    try {
        const result = await Grocery.deleteItem(req.session.userId, req.params.id);
        if (result.deletedCount === 0) {
            return res.status(404).json({ msg: 'Item not found' });
        }
        res.json({ msg: 'Item deleted successfully' });
    } catch (error) {
        console.error(error);
        res.json({ msg: 'Error deleting item' });
    }
};
