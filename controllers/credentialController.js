const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const { CommonLogger } = require('../utils/logger');
const { get_validity } = require('../utils/glOperations');
const { generateApiKey, hashPasswordArgon2i, generateUUIDv4 } = require('../utils/crypt');
const { ObjectId } = require('mongodb');

function getScopesFromQuery(scopes) {
	const result = {};
	scopes = scopes.map((scope) => scope.toLowerCase());
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
	const validScopes = new Set(['read', 'write', 'delete']);
	const invalidScopes = scopes.filter((scope) => !validScopes.has(scope.toLowerCase()));
	if (invalidScopes.length > 0) {
		throw new AppError('Invalid credential scope. Allowed values: read, write, delete', 400);
	}
}

async function validateCreateCredentialInput(data) {
	const { name, type, scopes } = data;
	let result = { is_active: true };
	if (!type || !name) {
		throw new AppError('Credential type and name is required', 400);
	}
	const name_regex = /^[a-zA-Z][a-zA-Z0-9 _-]{0,59}$/;
	if (!name_regex.test(name)) {
		throw new AppError(`Name does not match the required format ${name_regex}`, 400);
	}
	validateScopes(scopes);
	result.scopes = getScopesFromQuery(scopes);
	result.type = type.toLowerCase();
	result.name = name;
	let existingCredential = await MongoDB.credentials.findOne({ name, type: result.type, is_active: true });
	if (existingCredential) {
		throw new AppError('Name already exists for this credential type', 400);
	}
	if (result.type === 'basic') {
		let { username, password } = data;
		if (!username || !password) {
			throw new AppError('Username and password are required for basic credentials', 400);
		}
		existingCredential = await MongoDB.credentials.findOne({ username, type: result.type, is_active: true });
		if (existingCredential) {
			throw new AppError('Username already exists for basic credentials', 400);
		}
		result.username = username;
		const { hash, salt } = await hashPasswordArgon2i(password);
		result.hash = hash;
		result.salt = salt;
	} else if (result.type === 'api_key' || result.type === 'token') {
		result[result.type] = result.type === 'api_key' ? generateApiKey(42) : generateApiKey(64);
	} else if (result.type === 'oauth2') {
		const { redirect_uri } = data;
		result.redirect_uri = redirect_uri;
		result.client_secret = generateApiKey(64);
		let flag = true;
		while (flag) {
			result.client_id = generateUUIDv4();
			let existingClient = await MongoDB.credentials.findOne({ client_id: result.client_id });
			if (!existingClient) {
				flag = false;
			}
		}
	} else {
		throw new AppError('Unsupported credential type', 400);
	}
	return result;
}

async function validateUpdateCredentialInput(id, data) {
	const credential = await MongoDB.credentials.findOne({ _id: new ObjectId(id), is_active: true });
	const { name, password, scopes } = data;
	const result = {};
	if (!credential) {
		throw new AppError('Credential not found', 404);
	}
	if (credential.type === 'basic') {
		if (!password && !scopes && !name) {
			throw new AppError('Name, password or scopes are required for basic credentials', 400);
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
	} else if (credential.type === 'api_key' || credential.type === 'token' || credential.type === 'oauth2') {
		if (!scopes && !name) {
			throw new AppError('Scopes or name are required for API key or token credentials', 400);
		}
		if (scopes) {
			validateScopes(scopes);
			result.scopes = getScopesFromQuery(scopes);
		}
	}
	if (name) {
		const name_regex = /^[a-zA-Z][a-zA-Z0-9 _-]{0,59}$/;
		if (!name_regex.test(name)) {
			throw new AppError(`Name does not match the required format ${name_regex}`, 400);
		}
		const existingCredential = await MongoDB.credentials.findOne({
			name,
			type: credential.type,
			is_active: true,
			_id: {
				$ne: credential._id
			}
		});
		if (existingCredential) {
			throw new AppError('Name already exists for this credential type', 400);
		}
		result.name = name;
	}
	return result;
}

const PROJECT = {
	$project: {
		salt: 0,
		hash: 0,
		_created_by: 0,
		_updated_by: 0
	}
};

module.exports.getAllCredentials = async (req, res) => {
	try {
		const size = Number.parseInt(req.query.size) || 10;
		const page = Number.parseInt(req.query.page) || 1;
		const filter = { is_active : true};
		if(req.query?.name?.trim()) {
			filter.name = { $regex: req.query.name.trim(), $options: 'i' }
		}
		if(req.query?.type?.trim()) {
			filter.type = req.query.type.trim();
		}
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || 'id';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await MongoDB.credentials.countDocuments(filter);
		const data = await MongoDB.credentials
			.aggregate([
				{ $match: filter},
				MongoDB.LOOK_UP_CREATOR,
				MongoDB.LOOK_UP_UPDATOR,
				MongoDB.SET,
				{ $sort: { [sortDetails.sortBy]: sortDetails.sortOrder } },
				PROJECT,
				{ $skip: skip },
				{ $limit: size }
			])
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
		const data = (await MongoDB.credentials.aggregate([
				{ $match: { _id: new ObjectId(req.params.id) } },
				MongoDB.LOOK_UP_CREATOR,
				MongoDB.LOOK_UP_UPDATOR,
				MongoDB.SET,
				PROJECT
			])
			.toArray()
		).at(0);
		if (!data) {
			throw new AppError('Data not found', 404);
		}
		delete data?.salt;
		delete data?.hash;
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
		let { expire_in } = req.body;
		if (expire_in !== undefined && (expire_in < 30 || expire_in > 525600)) {
			throw new AppError('Expire in must be greater than or equal to 30 and less than or equal to 525600', 400);
		}
		expire_in = Number.parseInt(expire_in) || 7 * 24 * 60;
		const updateData = await validateCreateCredentialInput(req.body);
		req.password || delete req.password; // Ensure password is not logged
		const { _created_on, _expire_on } = get_validity(expire_in); // minutes
		updateData._created_by = new ObjectId(req.user);
		updateData._created_on = _created_on;
		updateData._updated_by = updateData._created_by;
		updateData._updated_on = _created_on;
		updateData._expire_on = _expire_on;
		const result = await MongoDB.credentials.insertOne(updateData);
		res.status(201).json({ success: true, data: { _id: result.insertedId, ...updateData } });
	} catch (err) {
		req.password || delete req.password; // Ensure password is not logged
		req.salt || delete req.salt; // Ensure salt is not logged
		req.hash || delete req.hash; // Ensure hash is not logged
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
		const updateData = await validateUpdateCredentialInput(req.params.id, req.body);
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		const result = await MongoDB.credentials.updateOne(
			{ _id: new ObjectId(req.params.id), is_active: true },
			{ $set: updateData }
		);
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
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await MongoDB.credentials.updateOne(
			{ _id: new ObjectId(req.params.id), is_active: true },
			{ $set: deleteData }
		);
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
		if (!req.isSystem) {
			throw new AppError('Unauthorized to clear credentials', 403);
		}
		const result = await MongoDB.credentials
			.find({ _expire_on: { $lte: req.requestTime }, is_active: true })
			.toArray();
		if (result.length === 0) {
			return res.status(200).json({ success: true, message: 'No expired credentials to clear' });
		}
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const deleteResult = await MongoDB.credentials.updateMany(
			{ _expire_on: { $lte: req.requestTime }, is_active: true },
			{ $set: deleteData }
		);
		if (deleteResult.modifiedCount === 0) {
			throw new AppError('Failed to clear expired credentials', 500);
		}
		res.status(200).json({ success: true, message: `Cleared ${deleteResult.modifiedCount} expired credentials` });
	} catch (err) {
		CommonLogger.error('Failed to clear expired credentials', { error: err });
		res.status(500).json({ error: 'Failed to clear expired credentials' });
	}
};
