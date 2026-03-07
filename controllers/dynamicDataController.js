const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const CacheMechanism = require('../utils/cache');
const { CommonLogger } = require('../utils/logger');
const { validateSchema } = require('../utils/schema');
const { ObjectId } = require('mongodb');

async function validateAuthType(api_path, originalUrl) {
    const type = originalUrl.split('/')[1];
    const resource = await MongoDB.resources.findOne({ api_path });
    if(!resource){
        throw new AppError('Resource not found', 404);
    }
    if(!resource.allowed_auth_methods.includes(type)) {
        throw new AppError('Invalid auth type', 401);
    }
    return resource;
}

module.exports.getAllDynamicData = async (req, res) => {
    try {
        if(!req.scopes.read){
            throw new AppError('Insufficient permissions to read data', 401);
        }
        const resource = await validateAuthType(req.params.resource_name, req.originalUrl);
        const size = Number.parseInt(req.query.size) || 10;
        const page = Number.parseInt(req.query.page) || 1;
        const sortDetails = {};
        sortDetails.sortBy = req.query.sortBy || '_created_on';
        sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
        const skip = (page - 1) * size;
        const total = await MongoDB.db.collection(resource.reference_name).countDocuments({ is_active: true });
        const dynamicData = await MongoDB.db.collection(resource.reference_name)
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
            data: dynamicData
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

module.exports.getDynamicData = async (req, res) => {
    try {
        if(!req.scopes.read){
            throw new AppError('Insufficient permissions to read data', 401);
        }
        const resource = await validateAuthType(req.params.resource_name, req.originalUrl);
        const data = await MongoDB.db.collection(resource.reference_name).findOne({ _id: new ObjectId(req.params.id) });
        if (!data || data.length === 0) {
            throw new AppError('Resource not found', 404);
        }
        res.status(200).json({ success: true, data: data });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to fetch data', { error: err });
        res.status(500).json({ error: 'Failed to fetch data' });
    }
};

module.exports.createDynamicData = async (req, res) => {
    try {
        if(!req.scopes.write){
            throw new AppError('Insufficient permissions to add data', 401);
        }
        const resource = await validateAuthType(req.params.resource_name, req.originalUrl);
        const { errors, value } = await validateSchema(resource.schema, req.body);
        if (errors?.length) {
            throw new AppError('Invalid input', 422, { errors });
        }
        const newResource = {
            ...value,
            is_active: true,
            _created_on: new Date().toISOString(),
            _created_by: new ObjectId(req.user)
        };
        const result = await MongoDB.db.collection(resource.reference_name).insertOne(newResource);
        res.status(201).json({ success: true, data: { _id: result.insertedId } });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to create data', { error: err });
        res.status(500).json({ error: 'Failed to create data' });
    }
};

module.exports.updateDynamicData = async (req, res) => {
    try {
        if(!req.scopes.write){
            throw new AppError('Insufficient permissions to update data', 401);
        }
        const dataId = req.params.id;
        const resource = await validateAuthType(req.params.resource_name, req.originalUrl);
        const { errors, value } = await validateSchema(resource.schema, req.body);
        if (errors?.length) {
            throw new AppError('Invalid input', 422, { errors });
        }
        const updateData = { ...value };
        if (Object.keys(updateData).length === 0) {
            throw new AppError('No valid fields to update', 400);
        }
        updateData._updated_by = new ObjectId(req.user);
        updateData._updated_on = new Date().toISOString();
        const result = await MongoDB.db.collection(resource.reference_name).updateOne({ _id: new ObjectId(dataId), is_active: true }, { $set: updateData });
        if (result.modifiedCount === 0) {
            throw new AppError('Data not found or no changes made', 404);
        }
        res.status(200).json({ success: true, data: { _id: dataId } });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to update data', { error: err });
        res.status(500).json({ error: 'Failed to update data' });
    }
};

module.exports.deleteDynamicData = async (req, res) => {
    // Implementation for deleting a user
    try {
        if(!req.scopes.delete){
            throw new AppError('Insufficient permissions to delete data', 401);
        }
        const dataId = req.params.id;
        const resource = await validateAuthType(req.params.resource_name, req.originalUrl);
        const deleteData = {
            is_active: false,
            _updated_by: new ObjectId(req.user),
            _updated_on: new Date().toISOString()
        };
        const result = await MongoDB.db.collection(resource.reference_name).updateOne({ _id: new ObjectId(dataId), is_active: true }, { $set: deleteData });
        if (result.modifiedCount === 0) {
            throw new AppError('Data not found or no changes made', 404);
        }
        res.status(204).json({ success: true, data: { _id: dataId } });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to delete data', { error: err });
        res.status(500).json({ error: 'Failed to delete data' });
    }
};