import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import BloodRequest from '../models/BloodRequest';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find();
    
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: { users }
    });
  } catch (error) {
    next(new AppError('Failed to fetch users', 500));
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phoneNumber, bloodType, address } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return next(new AppError('User with this phone number already exists', 400));
    }
    
    // Create new user
    const newUser = await User.create({
      name,
      phoneNumber,
      bloodType,
      address
    });
    
    res.status(201).json({
      status: 'success',
      data: { user: newUser }
    });
  } catch (error) {
    logger.error('Error creating user', error);
    next(new AppError('Failed to create user', 500));
  }
};

export const getProfile = async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    
    res.status(200).json({
      id: user._id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      bloodType: user.bloodType,
      address: user.address,
      lastDonation: user.lastDonation,
      hemoglobin: user.hemoglobin,
      gender: user.gender,
      age: user.age
    });
  } catch (error) {
    logger.error('Error fetching user profile', error);
    next(new AppError('Failed to fetch user profile', 500));
  }
};

export const updateProfile = async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const { name, phoneNumber, bloodType, address } = req.body;
    
    // Validate required fields
    if (!name || !phoneNumber || !bloodType || !address) {
      return next(new AppError('Name, phone number, blood type, and address are required', 400));
    }
    
    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, phoneNumber, bloodType, address },
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return next(new AppError('User not found', 404));
    }
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        phoneNumber: updatedUser.phoneNumber,
        bloodType: updatedUser.bloodType,
        address: updatedUser.address
      }
    });
  } catch (error) {
    logger.error('Error updating user profile', error);
    next(new AppError('Failed to update user profile', 500));
  }
};

export const updateDonationInfo = async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const { lastDonated, currentHemoglobin, gender, age } = req.body;
    
    // Update donation information
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        lastDonation: lastDonated ? new Date(lastDonated) : undefined,
        hemoglobin: currentHemoglobin,
        gender,
        age
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return next(new AppError('User not found', 404));
    }
    
    res.status(200).json({
      success: true,
      message: 'Donation information updated successfully',
      donationInfo: {
        lastDonated: updatedUser.lastDonation,
        currentHemoglobin: updatedUser.hemoglobin,
        gender: updatedUser.gender,
        age: updatedUser.age
      }
    });
  } catch (error) {
    logger.error('Error updating donation information', error);
    next(new AppError('Failed to update donation information', 500));
  }
};

export const getUserHistory = async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const { type } = req.query;
    
    const acceptedRequests: Array<any> = [];
    const requestedRequests: Array<any> = [];
    
    // Get requests accepted by the user
    if (!type || type === 'accepted') {
      const accepted = await BloodRequest.find({ 
        acceptedBy: userId,
        status: { $in: ['accepted', 'completed'] }
      })
      .select('hospital location bloodType date')
      .lean();
      
      acceptedRequests.push(...accepted);
    }
    
    // Get requests created by the user
    if (!type || type === 'requested') {
      const requested = await BloodRequest.find({ 
        requester: userId 
      })
      .select('hospital location bloodType viewCount date')
      .lean();
      
      requestedRequests.push(...requested);
    }
    
    res.status(200).json({
      accepted: acceptedRequests.map(req => ({
        id: req._id,
        hospital: req.hospital,
        location: req.location,
        bloodType: req.bloodType,
        date: req.date
      })),
      requested: requestedRequests.map(req => ({
        id: req._id,
        hospital: req.hospital,
        location: req.location,
        bloodType: req.bloodType,
        viewCount: req.viewCount,
        date: req.date
      }))
    });
  } catch (error) {
    logger.error('Error fetching user history', error);
    next(new AppError('Failed to fetch user history', 500));
  }
};

export const getOngoingRequests = async (req: Request & { user?: { id: string } }, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Find requests where user is the donor (acceptedBy)
    const donorRequests = await BloodRequest.find({
      acceptedBy: userId,
      status: 'accepted'
    })
    .populate('requester', 'name phoneNumber')
    .lean();
    
    // Find requests where user is the requester
    const requesterRequests = await BloodRequest.find({
      requester: userId,
      status: { $in: ['accepted', 'active'] }
    })
    .populate('acceptedBy', 'name phoneNumber')
    .lean();
    
    // Format the response
    const ongoingRequests = [
      ...donorRequests.map(req => {
        // Use type assertion for the populated requester
        const requesterInfo = req.requester as unknown as { _id: string; name: string; phoneNumber: string };
        
        return {
          id: req._id,
          hospital: req.hospital,
          location: req.location,
          bloodType: req.bloodType,
          date: req.date,
          time: req.time,
          status: req.status,
          role: 'donor',
          viewCount: req.viewCount,
          requesterInfo: {
            id: requesterInfo._id,
            name: requesterInfo.name,
            phoneNumber: requesterInfo.phoneNumber
          }
        };
      }),
      ...requesterRequests.map(req => {
        // // Check if acceptedBy exists and use type assertion
        // if (!req.acceptedBy) {
        //   return null; // Skip this request if acceptedBy is undefined
        // }
        
        const donorInfo = req?.acceptedBy as unknown as { _id: string; name: string; phoneNumber: string };
        
        return {
          id: req?._id,
          hospital: req?.hospital,
          location: req?.location,
          bloodType: req?.bloodType,
          date: req?.date,
          time: req?.time,
          status: req?.status,
          role: 'requester',
          viewCount: req?.viewCount,
          donorInfo: {
            id: donorInfo?._id,
            name: donorInfo?.name,
            phoneNumber: donorInfo?.phoneNumber
          }
        };
      }).filter(Boolean) // Remove null values
    ];
    
    res.status(200).json({
      ongoingRequests
    });
  } catch (error) {
    logger.error('Error fetching ongoing requests', error);
    next(new AppError('Failed to fetch ongoing requests', 500));
  }
}; 