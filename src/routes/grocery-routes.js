const express = require('express');
const router = express.Router();
const groceryController = require('../controllers/groceryController');
const { isAuthenticated } = require('../middleware/auth');

// READ - get all items and show form
router.get('/', isAuthenticated, groceryController.showAll);

// UPDATE - show pre-filled edit form
router.get('/:id/edit', isAuthenticated, groceryController.showEditForm);

// CREATE - submit new item
router.post('/', isAuthenticated, groceryController.createItem);

// UPDATE - submit edited item
router.post('/:id/update', isAuthenticated, groceryController.updateItem);

// DELETE - delete item
router.post('/:id/delete', isAuthenticated, groceryController.deleteItem);

module.exports = router;