const { Router } = require('express');

const dynamicDataRouter = Router();
const dynamicDataController = require('../controllers/dynamicDataController');

dynamicDataRouter.route('/:resource_name')
    .get(dynamicDataController.getAllDynamicData)
    .post(dynamicDataController.createDynamicData);
dynamicDataRouter.route('/:resource_name/:id')
    .get(dynamicDataController.getDynamicData)
    .put(dynamicDataController.updateDynamicData)
    .delete(dynamicDataController.deleteDynamicData);

module.exports = dynamicDataRouter;
