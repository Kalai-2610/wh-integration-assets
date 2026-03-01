const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const { generateApiKey, generateJWT, verifyJWT, getJWTPayload } = require('../utils/crypt');
const { ObjectId } = require('mongodb');
const { get_validity } = require('../utils/glOperations');
const { CommonLogger } = require('../utils/logger');

/**
 * Controller for OAuth 2.0 operations
 */
class OAuthController {
    static SUPPORTED_SCOPES = ['read', 'write', 'delete'];

    /**
     * Validates if the provided scope string contains only supported scopes.
     * @param {string} scope 
     * @returns {boolean}
     */
    static isValidScope(scope) {
        if (!scope) return false;
        const requestedScopes = scope.split(' ');
        return requestedScopes.every(s => OAuthController.SUPPORTED_SCOPES.includes(s));
    }

    /**
     * Converts a scope string into an object of booleans.
     * @param {string} scope 
     * @returns {object}
     */
    static scopeToObject(scope) {
        const requestedScopes = scope.split(' ');
        const scopeObj = {};
        OAuthController.SUPPORTED_SCOPES.forEach(s => {
            scopeObj[s] = requestedScopes.includes(s);
        });
        return scopeObj;
    }

    /**
     * Checks if the requested scopes are allowed for the client.
     * @param {object} requestedScopeObj - Requested scope object {read: true, ...}
     * @param {object} allowedScopes - Allowed scope object from client {read: true, ...}
     * @returns {boolean}
     */
    static isScopeAllowed(requestedScopeObj, allowedScopes) {
        if (!requestedScopeObj || !allowedScopes) return false;
        return Object.keys(requestedScopeObj).every(s => {
            if (requestedScopeObj[s] === true) {
                return allowedScopes[s] === true;
            }
            return true;
        });
    }

    /**
     * GET /authorize
     * Returns the authorization page (simulated)
     */
    static async getAuthorizePage(req, res) {
        try {
            const { client_id, response_type, redirect_uri, scope, state, user_id } = req.query;

            if (!client_id || response_type !== 'code') {
                throw new AppError('Invalid request: client_id and response_type=code are required', 400);
            }

            if (!user_id) {
                throw new AppError('Invalid request: user_id is required', 400);
            }

            if (!scope) {
                throw new AppError('Invalid request: scope is mandatory', 400);
            }

            if (!OAuthController.isValidScope(scope)) {
                throw new AppError(`Invalid scope. Supported scopes: ${OAuthController.SUPPORTED_SCOPES.join(', ')}`, 400);
            }

            const client = await MongoDB.credentials.findOne({ client_id, type: 'oauth2', is_active: true });
            if (!client) {
                throw new AppError('Invalid client', 401);
            }

            const scopeObj = OAuthController.scopeToObject(scope);
            if (!OAuthController.isScopeAllowed(scopeObj, client.scopes)) {
                throw new AppError('Requested scope exceeds client permissions', 403);
            }

            // Return a functional HTML page for the user to authorize
            res.setHeader('Content-Type', 'text/html');
            res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Authorize ${client.name}</title>
                    <style>
                        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
                        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
                        h1 { font-size: 1.5rem; margin-bottom: 1rem; }
                        p { color: #666; margin-bottom: 2rem; }
                        button { background: #007bff; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; }
                        button:hover { background: #0056b3; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Authorize ${client.name}</h1>
                        <p>The application <strong>${client.name}</strong> is requesting the following scopes: <strong>${Object.keys(scopeObj).filter(k => scopeObj[k]).join(', ')}</strong></p>
                        <form action="/auth/oauth/v1/authorize" method="POST">
                            <input type="hidden" name="client_id" value="${client_id}">
                            <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}">
                            <input type="hidden" name="scope" value="${scope}">
                            <input type="hidden" name="state" value="${state || ''}">
                            <input type="hidden" name="user_id" value="${user_id}">
                            <button type="submit">Authorize Access</button>
                        </form>
                    </div>
                </body>
                </html>
            `);
        } catch (err) {
            if (err instanceof AppError) {
                return res.status(err.statusCode).json({ success: false, error: err.message });
            }
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }

    /**
     * POST /authorize
     * Processes authorization and returns a code
     */
    static async authorize(req, res) {
        try {
            const { client_id, redirect_uri, scope, state, user_id } = req.body;

            if (!client_id || !user_id) {
                throw new AppError('client_id and user_id are required', 400);
            }

            if (!scope) {
                throw new AppError('scope is mandatory', 400);
            }

            if (!OAuthController.isValidScope(scope)) {
                throw new AppError(`Invalid scope. Supported scopes: ${OAuthController.SUPPORTED_SCOPES.join(', ')}`, 400);
            }

            const client = await MongoDB.credentials.findOne({ client_id, type: 'oauth2', is_active: true });
            if (!client) {
                throw new AppError('Invalid client', 401);
            }

            const scopeObj = OAuthController.scopeToObject(scope);
            if (!OAuthController.isScopeAllowed(scopeObj, client.scopes)) {
                throw new AppError('Requested scope exceeds client permissions', 403);
            }

            // Generate a random code
            const code = generateApiKey(48);
            const { _expire_on } = get_validity(10); // Code valid for 10 minutes

            await MongoDB.oauth_codes.insertOne({
                code,
                client_id,
                user_id: new ObjectId(user_id),
                redirect_uri,
                scope: scopeObj,
                is_used: false,
                _expire_on: new Date(_expire_on).toISOString()
            });

            // Perform a standard 302 redirect to the callback URL
            if (redirect_uri) {
                let redirectUrl = `${redirect_uri}?code=${code}`;
                if (state) {
                    redirectUrl += `&state=${state}`;
                }
                return res.redirect(302, redirectUrl);
            }

            res.status(200).json({
                success: true,
                data: {
                    code,
                    state
                }
            });
        } catch (err) {
            if (err instanceof AppError) {
                return res.status(err.statusCode).json({ success: false, error: err.message });
            }
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }

    /**
     * POST /token
     * Exchange code or credentials for a token
     */
    static async issueToken(req, res) {
        try {
            const { grant_type } = req.body;
            if (grant_type === 'authorization_code') {
                return await OAuthController.handleAuthCodeGrant(req, res);
            } else if (grant_type === 'client_credentials') {
                return await OAuthController.handleClientCredentialsGrant(req, res);
            } else {
                throw new AppError('Unsupported grant_type', 400);
            }
        } catch (err) {
            if (err instanceof AppError) {
                return res.status(err.statusCode).json({ success: false, error: err.message });
            }
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }

    /**
     * Handle Authorization Code Grant
     */
    static async handleAuthCodeGrant(req, res) {
        const { code, client_id, client_secret } = req.body;

        if (!code || !client_id || !client_secret) {
            throw new AppError('code, client_id, and client_secret are required', 400);
        }

        const client = await MongoDB.credentials.findOne({ client_id, type: 'oauth2', is_active: true });
        if (!client || client.client_secret !== client_secret) {
            throw new AppError('Invalid client credentials', 401);
        }

        const authCode = await MongoDB.oauth_codes.findOne({
            code,
            client_id,
            is_used: false
        });

        if (!authCode) {
            throw new AppError('Invalid or already used authorization code', 400);
        }

        if (new Date(authCode._expire_on) < new Date()) {
            throw new AppError('Authorization code expired', 400);
        }

        // Mark code as used
        await MongoDB.oauth_codes.updateOne({ _id: authCode._id }, { $set: { is_used: true } });

        const scopeObj = authCode.scope;

        const refreshToken = generateApiKey(64);
        const { _expire_on } = get_validity(24 * 60 * 7); // 7 days

        // Generate tokens
        const accessToken = generateJWT({
            userId: authCode.user_id.toString(),
            clientId: client_id,
            scopes: scopeObj
        }, '1h');


        await MongoDB.oauth_tokens.insertOne({
            access_token: accessToken,
            refresh_token: refreshToken,
            client_id,
            user_id: authCode.user_id,
            scopes: scopeObj,
            _expire_on
        });

        res.status(200).json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: refreshToken,
            scopes: scopeObj
        });
    }

    /**
     * Handle Client Credentials Grant
     */
    static async handleClientCredentialsGrant(req, res) {
        const { client_id, client_secret, scope } = req.body;

        if (!client_id || !client_secret) {
            throw new AppError('client_id and client_secret are required', 400);
        }
        if (!scope) {
            throw new AppError('scope is mandatory', 400);
        }

        if (!OAuthController.isValidScope(scope)) {
            throw new AppError(`Invalid scope. Supported scopes: ${OAuthController.SUPPORTED_SCOPES.join(', ')}`, 400);
        }

        const client = await MongoDB.credentials.findOne({ client_id, type: 'oauth2', is_active: true });
        if (!client || client?.client_secret !== client_secret) {
            throw new AppError('Invalid client credentials', 401);
        }

        const scopeObj = OAuthController.scopeToObject(scope);
        if (!OAuthController.isScopeAllowed(scopeObj, client.scopes)) {
            throw new AppError('Requested scope exceeds client permissions', 403);
        }

        // Generate token
        const accessToken = generateJWT({
            clientId: client_id,
            scopes: scopeObj,
            grant_type: 'client_credentials'
        }, '1h');
        res.status(200).json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scopes: scopeObj
        });
    }
}

module.exports = OAuthController;
