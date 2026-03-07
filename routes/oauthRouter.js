const { Router } = require('express');
const OAuthController = require('../controllers/oauthController');

const OAuthRouter = Router();

OAuthRouter.route('/authorize')
    .get(OAuthController.getAuthorizePage)
    .post(OAuthController.authorize);
OAuthRouter.post('/token', OAuthController.issueToken);

module.exports = OAuthRouter;
