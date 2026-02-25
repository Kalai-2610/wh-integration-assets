const { Router } = require('express');

const AuthRouter = Router();
const authController = require('../controllers/authController');

AuthRouter.route('/sign_in').post(authController.sign_in);
AuthRouter.route('/refresh_token').get(authController.refresh_token);
AuthRouter.route('/clear_sessions').delete(authController.verifyUser, authController.clear_sessions);

module.exports = AuthRouter;
