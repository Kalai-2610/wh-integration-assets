const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const { CommonLogger } = require('../utils/logger');
const { ObjectId } = require('mongodb');

let dataCollection;
setInterval(() => {
	dataCollection = MongoDB.db.collection('data');
}, 7 * 1000); // Keep the process alive

module.exports.getAllData = async (req, res) => {
	try {
		if (!req?.scopes?.read) {
			throw new AppError('Insufficient permissions to read data', 403);
		}
		let size = Number.parseInt(req.query.size) || 10;
		const page = Number.parseInt(req.query.page) || 1;
		size = Math.min(size, 25);
		const sortDetails = {};
		sortDetails.sortBy = req.query.sortBy || 'id';
		sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
		const skip = (page - 1) * size;

		const total = await dataCollection.countDocuments({ is_active: true });
		const data = await dataCollection
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
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch data', { error: err });
		res.status(500).json({ error: 'Failed to fetch data' });
	}
};

module.exports.getData = async (req, res) => {
	try {
		if (!req?.scopes?.read) {
			throw new AppError('Insufficient permissions to read data', 403);
		}
		const data = await dataCollection.findOne({ _id: new ObjectId(req.params.id), is_active: true });
		if (!data || data.length === 0) {
			throw new AppError('Data not found', 404);
		}
		res.status(200).json({ success: true, data });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to fetch data', { error: err });
		res.status(500).json({ error: 'Failed to fetch data' });
	}
};

module.exports.createData = async (req, res) => {
	try {
		if (!req?.scopes?.write) {
			throw new AppError('Insufficient permissions to create data', 403);
		}
		const createData = req.body;
		createData.is_active = true;
		const result = await dataCollection.insertOne(req.body);
		res.status(201).json({ success: true, data: { _id: result.insertedId } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to create data', { error: err });
		res.status(500).json({ error: 'Failed to create data' });
	}
};

module.exports.updateData = async (req, res) => {
	// Implementation for updating data details
	try {
		if (!req?.scopes?.write) {
			throw new AppError('Insufficient permissions to update data', 403);
		}
		const updateData = req.body;
		updateData._updated_on = new Date().toISOString();
		updateData._updated_by = new ObjectId(req.user);
		const result = await dataCollection.updateOne({ _id: new ObjectId(req.params.id), is_active: true }, { $set: updateData });
		if (result.modifiedCount === 0) {
			throw new AppError('Data not found or no changes made', 404);
		}
		res.status(200).json({ success: true, data: { id: req.params.id } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to update data', { error: err });
		res.status(500).json({ error: 'Failed to update data' });
	}
};

module.exports.deleteData = async (req, res) => {
	// Implementation for deleting a data item (soft delete by setting is_active to false)
	try {
		if (!req?.scopes?.delete) {
			throw new AppError('Insufficient permissions to delete data', 403);
		}
		const deleteData = {
			is_active: false,
			_updated_on: new Date().toISOString(),
			_updated_by: new ObjectId(req.user)
		};
		const result = await dataCollection.updateOne({ _id: new ObjectId(req.params.id), is_active: true }, { $set: deleteData });
		if (result.modifiedCount === 0) {
			throw new AppError('Data not found or no changes made', 404);
		}
		res.status(204).json({ success: true, data: { id: req.params.id } });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to delete data', { error: err });
		res.status(500).json({ error: 'Failed to delete data' });
	}
};
