const { Router } = require('express');

const ResourceRouter = Router();
const resourceController = require('../controllers/resourceController');

ResourceRouter.route('/')
    .get(resourceController.getAllResources)
    .post(resourceController.createResource);
ResourceRouter.route('/:id')
    .get(resourceController.getResource)
    .patch(resourceController.updateResource)
    .delete(resourceController.deleteResource);

module.exports = ResourceRouter;
