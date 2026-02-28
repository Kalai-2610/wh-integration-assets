const { Router } = require('express');

const CredentialRouter = Router();
const credentialController = require('../controllers/credentialController');

CredentialRouter.route('/')
    .get(credentialController.getAllCredentials)
    .post(credentialController.createCredential);
CredentialRouter.route('/clear')
    .delete(credentialController.clearCredentials);
CredentialRouter.route('/:id')
	.get(credentialController.getCredential)
	.patch(credentialController.updateCredential)
	.delete(credentialController.deleteData);

module.exports = CredentialRouter;
