const express = require('express');
const router = express.Router();
const groceryController = require('../controllers/groceryController');

// READ - get all items and show form
router.get('/', groceryController.showAll);

// UPDATE - show pre-filled edit form
router.get('/:id/edit', groceryController.showEditForm);

// CREATE - submit new item
router.post('/', groceryController.createItem);

// UPDATE - submit edited item
router.put('/:id', groceryController.updateItem);

// DELETE - delete item
router.delete('/:id', groceryController.deleteItem);

module.exports = router;