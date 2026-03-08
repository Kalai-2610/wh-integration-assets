const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');
const { generateJoiSchema } = require('../utils/schema');
const { ObjectId } = require('mongodb');

const valid_auth_methods = ['open', 'basic', 'api_key', 'token', 'oauth2'];
const PROJECT = { $project: { _created_by: 0, _updated_by: 0 } };

module.exports.getAllResources = async (req, res) => {
	try {
		const size = Number.parseInt(req.query.size) || 10;
		const page = Number.parseInt(req.query.page) || 1;
		const filter = { is_active: true };
		if (req.query?.name?.trim()) {
			filter.name = { $regex: req.query.name.trim(), $options: 'i' };
		}
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await MongoDB.resources.countDocuments(filter);
		const resources = await MongoDB.resources
			.aggregate([
				{ $match: filter },
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
			data: resources
		};
		res.status(200).json(res.body);
	} catch (err) {
		CommonLogger.error('Failed to fetch resources', { error: err });
		res.status(500).json({ error: 'Failed to fetch resources' });
	}
};

module.exports.getResource = async (req, res) => {
	try {
		const resource = (
			await MongoDB.resources
				.aggregate([
					{ $match: { _id: new ObjectId(req.params.id) } },
					MongoDB.LOOK_UP_CREATOR,
					MongoDB.LOOK_UP_UPDATOR,
					MongoDB.SET,
					PROJECT
				])
				.toArray()
		).at(0);
		if (!resource) {
			throw new AppError('Resource not found', 404);
		}
		res.status(200).json({ success: true, data: resource });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch resource', { error: err });
		res.status(500).json({ error: 'Failed to fetch resource' });
	}
};

module.exports.createResource = async (req, res) => {
	try {
		const { name, schema, api_path, reference_name, allowed_auth_methods } = req.body;

		if (!name || !schema || !api_path || !reference_name || !allowed_auth_methods?.length) {
			throw new AppError('name, schema, api_path, reference_name, and allowed_auth_methods are required', 400);
		}
		if (!Array.isArray(allowed_auth_methods)) {
			throw new AppError('allowed_auth_methods must be an array', 400);
		}
		const invalid_auth_methods = allowed_auth_methods.filter(
			(auth_method) => !valid_auth_methods.includes(auth_method)
		);
		if (invalid_auth_methods.length > 0) {
			throw new AppError(
				'Invalid allowed_auth_methods, Allowed methods are ' + valid_auth_methods.join(', '),
				400
			);
		}
		const name_regex = /^[a-zA-Z][a-zA-Z0-9 _-]{0,59}$/;
		if (!name_regex.test(name)) {
			throw new AppError(`Name does not match the required format ${name_regex}`, 400);
		}
		const api_path_regex = /^[a-z][a-z0-9-]{0,29}$/;
		if (!api_path_regex.test(api_path)) {
			throw new AppError(`API path does not match the required format ${api_path_regex}`, 400);
		}
		const reference_name_regex = /^[a-z][a-z0-9_]{0,29}$/;
		if (!reference_name_regex.test(reference_name)) {
			throw new AppError(`Reference name does not match the required format ${reference_name_regex}`, 400);
		}
		const system_collections = CacheMechanism.get('system_collections');
		if (system_collections.includes(reference_name.trim())) {
			throw new AppError('Reference name already in use', 409);
		}
		let errors = (await generateJoiSchema(schema)).errors;
		if (errors.length) {
			throw new AppError('Invalid schema', 400, { errors });
		}
		const existingResource = await MongoDB.resources
			.find({ $or: [{ api_path }, { name }, { reference_name }] })
			.toArray();
		errors = new Set();
		if (existingResource.length > 0) {
			existingResource.forEach((each) => {
				if (each.name === name) {
					errors.add('Name already in use');
				}
				if (each.api_path === api_path) {
					errors.add('API path already in use');
				}
				if (each.reference_name === reference_name) {
					errors.add('Reference name already in use');
				}
			});
			throw new AppError('API path or name or reference name already in use', 409, {
				errors: Array.from(errors)
			});
		}

		const newResource = {
			name,
			schema,
			api_path,
			reference_name,
			allowed_auth_methods,
			is_active: true,
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await MongoDB.resources.insertOne(newResource);
		MongoDB.db.createCollection(reference_name);
		res.status(201).json({ success: true, data: { _id: result.insertedId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create resource', { error: err });
		res.status(500).json({ error: 'Failed to create resource' });
	}
};

module.exports.updateResource = async (req, res) => {
	try {
		const resourceId = req.params.id;
		const { name, api_path, schema, allowed_auth_methods } = req.body;
		const updateData = { name, api_path, schema, allowed_auth_methods };
		name || delete updateData.name;
		schema || delete updateData.schema;
		api_path || delete updateData.api_path;
		allowed_auth_methods || delete updateData.allowed_auth_methods;
		if (Object.keys(updateData).length === 0) {
			throw new AppError('No valid fields to update', 400);
		}
		if (allowed_auth_methods && (!Array.isArray(allowed_auth_methods) || !allowed_auth_methods.length)) {
			throw new AppError('allowed_auth_methods must be a non-empty array', 400);
		}
		const invalid_auth_methods = allowed_auth_methods?.filter(
			(auth_method) => !valid_auth_methods.includes(auth_method)
		);
		if (invalid_auth_methods?.length > 0) {
			throw new AppError('Invalid allowed_auth_methods, Allowed methods are ' + valid_auth_methods.join(', '), 400);
		}
		const name_regex = /^[a-zA-Z][a-zA-Z0-9 _-]{0,59}$/;
		if (name && !name_regex.test(name)) {
			throw new AppError(`Name does not match the required format ${name_regex}`, 400);
		}
		const api_path_regex = /^[a-z][a-z0-9-]{0,29}$/;
		if (api_path && !api_path_regex.test(api_path)) {
			throw new AppError(`API path does not match the required format ${api_path_regex}`, 400);
		}
		let errors;
		if (schema) {
			errors = (await generateJoiSchema(schema)).errors;
		}
		if (errors?.length) {
			throw new AppError('Invalid schema', 400, { errors });
		}
		const existingResource = await MongoDB.resources
			.find({ $or: [{ api_path }, { name }], _id: { $ne: new ObjectId(resourceId) } })
			.toArray();
		errors = new Set();
		if (existingResource.length > 0) {
			existingResource.forEach((each) => {
				if (each.name === name) {
					errors.add('Name already in use');
				}
				if (each.api_path === api_path) {
					errors.add('API path already in use');
				}
			});
			throw new AppError('API path or name or reference name already in use', 409, {
				errors: Array.from(errors)
			});
		}
		updateData._updated_by = new ObjectId(req.user);
		updateData._updated_on = new Date().toISOString();
		const result = await MongoDB.resources.updateOne(
			{ _id: new ObjectId(resourceId), is_active: true },
			{ $set: updateData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Resource not found or no changes made', 404);
		}
		res.status(200).json({ success: true, data: { _id: resourceId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update resource', { error: err });
		res.status(500).json({ error: 'Failed to update resource' });
	}
};

module.exports.deleteResource = async (req, res) => {
	// Implementation for deleting a user
	try {
		const resourceId = req.params.id;
		const deleteData = {
			is_active: false,
			_updated_by: new ObjectId(req.user),
			_updated_on: new Date().toISOString()
		};
		const result = await MongoDB.resources.updateOne(
			{ _id: new ObjectId(resourceId), is_active: true },
			{ $set: deleteData }
		);
		if (result.modifiedCount === 0) {
			throw new AppError('Resource not found or no changes made', 404);
		}
		res.status(204).json({ success: true, data: { _id: resourceId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete resource', { error: err });
		res.status(500).json({ error: 'Failed to delete resource' });
	}
};
