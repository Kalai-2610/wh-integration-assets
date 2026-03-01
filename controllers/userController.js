const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');
const { hashPasswordArgon2i } = require('../utils/crypt');
const { ObjectId } = require('mongodb');

const LOOK_UP = {
	$lookup: {
		from: 'users',
		let: { creatorId: '$_created_by' },
		pipeline: [
			{ $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } },
			{ $project: { name: 1, email: 1, _id: 1, is_active: 1 } } // remove salt & hash from joined user
		],
		as: 'createdBy'
	}
};
const PROJECT = {
	$project: {
		salt: 0,
		hash: 0,
		_created_by: 0,
	}
};
const UNWIND = {
	$unwind: {
		path: '$createdBy',
		preserveNullAndEmptyArrays: true
	}
};
module.exports.getAllUsers = async (req, res) => {
	try {
		const size = Number.parseInt(req.query.size) || 10;
		const page = Number.parseInt(req.query.page) || 1;
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || '_created_on';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const is_active = req.query?.is_active != 0;
		const skip = (page - 1) * size;

		const total = await MongoDB.users.countDocuments({ is_active });
		const users = await MongoDB.users.aggregate([{ $match: { is_active } }, LOOK_UP, UNWIND, { $sort: { [sortDetails.sortBy]: sortDetails.sortOrder } }, PROJECT, { $skip: skip }, { $limit: size }]).toArray();
		res.body = {
			success: true,
			pagination: {
				total,
				page,
				size,
				sortBy: sortDetails.sortBy,
				sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
			},
			data: users
		};
		res.status(200).json(res.body);
	} catch (err) {
		CommonLogger.error('Failed to fetch users', { error: err });
		res.status(500).json({ error: 'Failed to fetch users' });
	}
};

module.exports.getUser = async (req, res) => {
	try {
		const user = await MongoDB.users.aggregate([{ $match: { _id: new ObjectId(req.params.id) } }, LOOK_UP, UNWIND, PROJECT]).toArray();
		delete user?.salt;
		delete user?.hash;
		if (!user || user.length === 0) {
			throw new AppError('User not found', 404);
		}
		res.status(200).json({ success: true, data: user });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch user', { error: err });
		res.status(500).json({ error: 'Failed to fetch user' });
	}
};

module.exports.createUser = async (req, res) => {
	try {
		const { name, email, password } = req.body;
		delete req.body.password;
		if (!name || !email || !password) {
			throw new AppError('Name, email, and password are required', 400);
		}
		const existingUser = await MongoDB.users.findOne({ email });
		if (existingUser) {
			throw new AppError('Email already in use', 409);
		}
		const { salt, hash } = await hashPasswordArgon2i(password);
		const newUser = {
			name,
			email,
			salt,
			hash,
			is_active: true,
			_created_on: new Date().toISOString(),
			_created_by: new ObjectId(req.user)
		};
		const result = await MongoDB.users.insertOne(newUser);
		res.status(201).json({ success: true, data: { _id: result.insertedId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create user', { error: err });
		res.status(500).json({ error: 'Failed to create user' });
	}
};

module.exports.updateUser = async (req, res) => {
	// Implementation for updating user details
	try {
		const userId = req.params.id;
		const { name } = req.body;
		const updateData = { name };
		name || delete updateData.name;
		if (Object.keys(updateData).length === 0) {
			throw new AppError('No valid fields to update', 400);
		}
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		const result = await MongoDB.users.updateOne({ _id: new ObjectId(userId), is_active: true }, { $set: updateData });
		if (result.modifiedCount === 0) {
			throw new AppError('User not found or no changes made', 404);
		}
		res.status(200).json({ success: true, data: { _id: userId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update user', { error: err });
		res.status(500).json({ error: 'Failed to update user' });
	}
};

module.exports.deleteUser = async (req, res) => {
	// Implementation for deleting a user
	try {
		const userId = req.params.id;
		const user = await MongoDB.users.findOne({ _id: new ObjectId(userId), is_active: true });
		if (!user) {
			throw new AppError('User not found', 404);
		}
		const system = CacheMechanism.get('systemUser');
		if (user.email === system.email) {
			throw new AppError('Cannot delete user', 403);
		}
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await MongoDB.users.updateOne({ _id: new ObjectId(userId), is_active: true }, { $set: deleteData });
		if (result.modifiedCount === 0) {
			throw new AppError('User not found', 404);
		}
		res.status(204).json({ success: true, data: { _id: userId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete user', { error: err });
		res.status(500).json({ error: 'Failed to delete user' });
	}
};