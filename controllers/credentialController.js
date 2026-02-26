const { ObjectId } = require('mongodb');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const { CommonLogger } = require('../utils/logger');
const { generateApiKey, hashPasswordArgon2i } = require('../utils/crypt');
const { get_validity } = require('../utils/glOperations');

let credentialsCollection;
setInterval(() => {
	credentialsCollection = MongoDB.db.collection('credentials');
}, 2 * 1000); // Keep the process alive

function getScopesFromQuery(scopes) {
    const result = {};
    scopes = scopes.map(scope => scope.toLowerCase());
    result.read = scopes.includes('read');
    result.write = scopes.includes('write');
    result.delete = scopes.includes('delete');
    return result;
}

function validateScopes(scopes) {
    if (!scopes) {
        throw new AppError('Credential scopes are required', 400);
    }
    if (!Array.isArray(scopes)) {
        throw new AppError('Scopes must be an array of strings', 400);
    }
    const validScopes = ["read", "write", "delete"];
    const invalidScopes = scopes.filter(scope => !validScopes.includes(scope.toLowerCase()));
    if (invalidScopes.length > 0) {
        throw new AppError('Invalid credential scope. Allowed values: read, write, delete', 400);
    }
}

async function validateCreateCredentialInput(data) {
    const { type, scopes } = data;
    let result = { is_active: true };
    if (!type) {
        throw new AppError('Credential type is required', 400);
    }
    validateScopes(scopes);
    result.scopes = getScopesFromQuery(scopes);
    if (type.toLowerCase() === "basic") {
        result.type = 'basic';
        let { username, password } = data;
        if (!username || !password) {
            throw new AppError('Username and password are required for basic credentials', 400);
        }
        const existingCredential = await credentialsCollection.findOne({ username, type: 'basic', is_active: true });
        if (existingCredential) {
            throw new AppError('Username already exists for basic credentials', 400);
        }
        result.username = username;
        const { hash, salt } = await hashPasswordArgon2i(password);
        result.hash = hash;
        result.salt = salt;
    } else if (type.toLowerCase() === 'api_key' || type.toLowerCase() === 'token') {
        result.type = type.toLowerCase();
        result[result.type] = result.type === 'api_key' ? generateApiKey(42) : generateApiKey(64);
    } else {
        throw new AppError('Unsupported credential type', 400);
    }
    return result;
}

async function validateUpdateCredentialInput(id, data) {
    const credential = await credentialsCollection.findOne({ _id: new ObjectId(id), is_active: true });
    const {password, scopes} = data;
    const result = {};
    if (!credential) {
        throw new AppError('Credential not found', 404);
    }
    if (credential.type === 'basic' ) {
        if (!password || !scopes) {
            throw new AppError('Password or scopes are required for basic credentials', 400);
        }
        if (scopes) {
            validateScopes(scopes);
            result.scopes = getScopesFromQuery(scopes);
        }
        if (password) {
            const { hash, salt } = await hashPasswordArgon2i(password);
            result.hash = hash;
            result.salt = salt;
        }
    } else if (credential.type === 'api_key' || credential.type === 'token') {
        if (!scopes) {
            throw new AppError('Scopes are required for API key or token credentials', 400);
        }
        validateScopes(scopes);
        result.scopes = getScopesFromQuery(scopes);
    }
    return result;
}

module.exports.getAllCredentials = async (req, res) => {
	try {
		const size = parseInt(req.query.size) || 10;
		const page = parseInt(req.query.page) || 1;
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || 'id';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await credentialsCollection.countDocuments({ is_active: true });
		const data = await credentialsCollection
			.find({ is_active: true })
			.sort({ [sortDetails.sortBy]: sortDetails.sortOrder })
			.skip(skip)
			.limit(size)
			.toArray();
		res.body = {
			success: true,
			pagination: {
				total,
				page,
				size,
				sortBy: sortDetails.sortBy,
				sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
			},
			data
		};
		res.status(200).json(res.body);
	} catch (err) {
		CommonLogger.error('Failed to fetch credentials', { error: err });
		res.status(500).json({ error: 'Failed to fetch credentials' });
	}
};

module.exports.getCredential = async (req, res) => {
	try {
		const data = await credentialsCollection.findOne({ id: new ObjectId(req.params.id), is_active: true });
		if (!data || data.length === 0) {
			throw new AppError('Data not found', 404);
		}
		res.status(200).json({ success: true, data });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch credential', { error: err });
		res.status(500).json({ error: 'Failed to fetch credential' });
	}
};

module.exports.createCredential = async (req, res) => {
	try {
        const updateData = await validateCreateCredentialInput(req.body);
        req.password || delete req.password; // Ensure password is not logged
        const { _created_on, _expire_on } = get_validity(7 * 24 * 60); // minutes
        updateData._created_by = new ObjectId(req.user.id);
        updateData._created_on = _created_on;
        updateData._expire_on = _expire_on;
		const result = await credentialsCollection.insertOne(updateData);
		res.status(201).json({ success: true, data: { _id: result.insertedId, ...updateData } });
	} catch (err) {
        req.password || delete req.password; // Ensure password is not logged
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create credential', { error: err });
		res.status(500).json({ error: 'Failed to create credential' });
	}
};

module.exports.updateCredential = async (req, res) => {
	// Implementation for updating credential details
	try {
        const updateData = validateUpdateCredentialInput(req.params.id, req.body);
		const result = await credentialsCollection.updateOne({ _id: new ObjectId(req.params.id), is_active: true }, { $set: updateData });
		if (result.modifiedCount === 0) {
			throw new AppError('Credential not found or no changes made', 404);
		}
		res.status(200).json({ success: true, data: { id: req.params.id } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update credential', { error: err });
		res.status(500).json({ error: 'Failed to update credential' });
	}
};

module.exports.deleteData = async (req, res) => {
	// Implementation for deleting a credential item (soft delete by setting is_active to false)
	try {
		const data = await credentialsCollection.findOne({ _id: new ObjectId(req.params.id), is_active: true });
		if (!data) {
			throw new AppError('Credential not found', 404);
		}
		const result = await credentialsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { is_active: false } });
		if (result.modifiedCount === 0) {
			throw new AppError('Credential not found or already deleted', 404);
		}
		res.status(204).json({ success: true, data: { id: req.params.id } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete credential', { error: err });
		res.status(500).json({ error: 'Failed to delete credential' });
	}
};

module.exports.clearCredentials = async (req, res) => {
    try {
        const result = await credentialsCollection.find({ _expire_on: { $lte: req.requestTime }, is_active: true }).toArray();
        if (result.length === 0) {
            return res.status(200).json({ success: true, message: 'No expired credentials to clear' });
        }
        const deleteResult = await credentialsCollection.updateMany({ _expire_on: { $lte: req.requestTime }, is_active: true }, { $set: { is_active: false } });
        if (deleteResult.modifiedCount === 0) {
            throw new AppError('Failed to clear expired credentials', 500);
        }
        res.status(200).json({ success: true, message: `Cleared ${deleteResult.modifiedCount} expired credentials` });
    } catch (err) {
        CommonLogger.error('Failed to clear expired credentials', { error: err });
        res.status(500).json({ error: 'Failed to clear expired credentials' });
    }
};
