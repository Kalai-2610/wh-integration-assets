const { Router } = require('express');

const DataRouter = Router();
const dataController = require('../controllers/dataController');

DataRouter.route('/')
    .get(dataController.getAllData)
    .post(dataController.createData);
DataRouter.route('/:id')
    .get(dataController.getData)
    .patch(dataController.updateData)
    .delete(dataController.deleteData);

module.exports = DataRouter;
