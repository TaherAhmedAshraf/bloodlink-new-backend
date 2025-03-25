import { Request, Response, NextFunction } from 'express';
import BloodRequest from '../models/BloodRequest';
import Notification from '../models/Notification';
import User from '../models/User';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import mongoose from 'mongoose';

// Define a custom Request type that includes the user property
type AuthRequest = Request & { user?: { id: string } };

export const createBloodRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      bloodType,
      hospital,
      location,
      hemoglobinPoint,
      patientProblem,
      bagNeeded,
      zone,
      date,
      time,
      additionalInfo
    } = req.body;
    
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Create blood request
    const bloodRequest = await BloodRequest.create({
      bloodType,
      hospital,
      location,
      hemoglobinPoint,
      patientProblem,
      bagNeeded,
      zone,
      date,
      time,
      additionalInfo,
      requester: userId,
      status: 'active',
      viewCount: 0
    });
    
    res.status(201).json({
      success: true,
      message: 'Blood request created successfully',
      requestId: bloodRequest._id
    });
  } catch (error) {
    logger.error('Error creating blood request', error);
    next(new AppError('Failed to create blood request', 500));
  }
};

export const getBloodRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bloodType, zone, page = 1, limit = 10 } = req.query;
    
    // Build query
    const query: any = { status: 'active' };
    
    if (bloodType) {
      query.bloodType = bloodType;
    }
    
    if (zone) {
      query.zone = { $regex: zone, $options: 'i' };
    }
    
    // Calculate pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count
    const total = await BloodRequest.countDocuments(query);
    
    // Get blood requests
    const bloodRequests = await BloodRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    // Calculate days ago for each request
    const now = new Date();
    const requests = bloodRequests.map(req => {
      const createdAt = new Date(req.createdAt);
      const diffTime = Math.abs(now.getTime() - createdAt.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        id: req._id,
        bloodType: req.bloodType,
        hospital: req.hospital,
        location: req.location,
        zone: req.zone,
        date: req.date,
        time: req.time,
        createdAt: req.createdAt,
        status: req.status,
        viewCount: req.viewCount,
        daysAgo: diffDays,
        bagNeeded: req.bagNeeded
      };
    });
    
    res.status(200).json({
      requests,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching blood requests', error);
    next(new AppError('Failed to fetch blood requests', 500));
  }
};

export const getBloodRequestDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return next(new AppError('Invalid request ID', 400));
    }
    
    // Increment view count
    const bloodRequest = await BloodRequest.findByIdAndUpdate(
      requestId,
      { $inc: { viewCount: 1 } },
      { new: true }
    ).populate('requester', 'name phoneNumber')
     .populate('acceptedBy', 'name phoneNumber');
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    // Ensure requester is properly populated
    if (!bloodRequest.requester || typeof bloodRequest.requester === 'string') {
      return next(new AppError('Requester information not available', 500));
    }
    
    // Use type assertion to tell TypeScript about the populated structure
    const requester = bloodRequest.requester as unknown as { _id: string; name: string; phoneNumber: string };
    
    res.status(200).json({
      id: bloodRequest._id,
      bloodType: bloodRequest.bloodType,
      hospital: bloodRequest.hospital,
      location: bloodRequest.location,
      hemoglobinPoint: bloodRequest.hemoglobinPoint,
      patientProblem: bloodRequest.patientProblem,
      bagNeeded: bloodRequest.bagNeeded,
      zone: bloodRequest.zone,
      date: bloodRequest.date,
      time: bloodRequest.time,
      additionalInfo: bloodRequest.additionalInfo,
      status: bloodRequest.status,
      viewCount: bloodRequest.viewCount,
      requester: {
        id: requester._id,
        name: requester.name,
        phoneNumber: requester.phoneNumber
      }
    });
  } catch (error) {
    logger.error('Error fetching blood request details', error);
    next(new AppError('Failed to fetch blood request details', 500));
  }
};

export const acceptBloodRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is blacklisted
    const user = await User.findById(userId);
    if (user?.isBlacklisted) {
      return next(new AppError('You are currently not allowed to accept blood requests', 403));
    }
    
    // Find blood request
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    if (bloodRequest.status !== 'active') {
      return next(new AppError('This blood request is no longer active', 400));
    }
    
    if (bloodRequest.requester.toString() === userId) {
      return next(new AppError('You cannot accept your own blood request', 400));
    }
    
    // Update blood request status
    bloodRequest.status = 'accepted';
    bloodRequest.acceptedBy = new mongoose.Types.ObjectId(userId);
    await bloodRequest.save();
    
    // Get accepting user details for notification
    const acceptingUser = await User.findById(userId);
    
    // Create notification for requester
    await Notification.create({
      type: 'request_accepted',
      title: 'Blood Request Accepted',
      user: bloodRequest.requester,
      relatedUser: userId,
      message: `${acceptingUser?.name} has accepted your blood request`,
      isRead: false
    });
    
    res.status(200).json({
      success: true,
      message: 'Blood request accepted successfully',
      requestId: bloodRequest._id,
      status: bloodRequest.status
    });
  } catch (error) {
    logger.error('Error accepting blood request', error);
    next(new AppError('Failed to accept blood request', 500));
  }
};

export const completeBloodRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Find blood request
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    if (bloodRequest.status !== 'accepted') {
      return next(new AppError('This blood request is not in accepted state', 400));
    }
    
    // Check if user is either the requester or the acceptor
    if (bloodRequest.requester.toString() !== userId && 
        (bloodRequest.acceptedBy?.toString() !== userId)) {
      return next(new AppError('You are not authorized to complete this request', 403));
    }
    
    // Update blood request status
    bloodRequest.status = 'completed';
    bloodRequest.completedAt = new Date();
    await bloodRequest.save();
    
    // Create notification for the other party
    let notificationRecipient;
    
    if (bloodRequest.requester.toString() === userId) {
      // If the requester is completing the request, notify the acceptor
      if (!bloodRequest.acceptedBy) {
        return next(new AppError('This request has no acceptor', 400));
      }
      notificationRecipient = bloodRequest.acceptedBy;
    } else {
      // If the acceptor is completing the request, notify the requester
      notificationRecipient = bloodRequest.requester;
    }
    
    const notificationSender = await User.findById(userId);
    
    await Notification.create({
      type: 'donation_completed',
      title: 'Blood Donation Completed',
      user: notificationRecipient,
      relatedUser: userId,
      message: `${notificationSender?.name} has marked the blood donation as completed`,
      isRead: false
    });
    
    res.status(200).json({
      success: true,
      message: 'Blood donation marked as completed',
      requestId: bloodRequest._id,
      status: bloodRequest.status
    });
  } catch (error) {
    logger.error('Error completing blood request', error);
    next(new AppError('Failed to complete blood request', 500));
  }
};

export const cancelBloodRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Find blood request
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    // Check if user is the requester
    if (bloodRequest.requester.toString() !== userId) {
      return next(new AppError('You can only cancel your own blood requests', 403));
    }
    
    // Check if request is already completed or cancelled
    if (bloodRequest.status === 'completed' || bloodRequest.status === 'cancelled') {
      return next(new AppError(`This blood request is already ${bloodRequest.status}`, 400));
    }
    
    // Update blood request status
    bloodRequest.status = 'cancelled';
    bloodRequest.cancelReason = reason || 'No reason provided';
    await bloodRequest.save();
    
    // If the request was accepted, notify the donor
    if (bloodRequest.acceptedBy) {
      const requesterUser = await User.findById(userId);
      
      await Notification.create({
        type: 'request_cancelled',
        title: 'Blood Request Cancelled',
        user: bloodRequest.acceptedBy,
        relatedUser: userId,
        message: `${requesterUser?.name} has cancelled their blood request. Reason: ${bloodRequest.cancelReason}`,
        isRead: false
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Blood request cancelled successfully',
      requestId: bloodRequest._id,
      status: bloodRequest.status
    });
  } catch (error) {
    logger.error('Error cancelling blood request', error);
    next(new AppError('Failed to cancel blood request', 500));
  }
};

export const reportDonor = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    if (!reason) {
      return next(new AppError('Reason for reporting is required', 400));
    }
    
    // Find blood request
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    // Check if user is the requester
    if (bloodRequest.requester.toString() !== userId) {
      return next(new AppError('You can only report donors for your own blood requests', 403));
    }
    
    // Check if request has an acceptor
    if (!bloodRequest.acceptedBy) {
      return next(new AppError('This blood request has not been accepted by any donor', 400));
    }
    
    // Check if request is in the right state
    if (bloodRequest.status !== 'accepted') {
      return next(new AppError(`Cannot report donor for a request with status: ${bloodRequest.status}`, 400));
    }
    
    // Update blood request
    bloodRequest.isReported = true;
    bloodRequest.reportReason = reason;
    await bloodRequest.save();
    
    // Update donor's report information
    const donorId = bloodRequest.acceptedBy;
    const donor = await User.findById(donorId);
    
    if (donor) {
      // Increment report count
      donor.reportCount = (donor.reportCount || 0) + 1;
      
      // Add this request to the donor's reported requests
      if (!donor.reportedRequests) {
        donor.reportedRequests = [];
      }
      donor.reportedRequests.push(bloodRequest._id);
      
      // Automatically blacklist users with 3 or more reports
      if (donor.reportCount >= 3) {
        donor.isBlacklisted = true;
        
        // Create notification for admin about blacklisted user
        logger.warn(`User ${donor._id} (${donor.name}) has been blacklisted due to multiple reports`);
      }
      
      await donor.save();
    }
    
    // Create notification for admin
    logger.info(`Donor ${donorId} reported for request ${requestId}. Reason: ${reason}`);
    
    res.status(200).json({
      success: true,
      message: 'Donor reported successfully',
      requestId: bloodRequest._id
    });
  } catch (error) {
    logger.error('Error reporting donor', error);
    next(new AppError('Failed to report donor', 500));
  }
};

export const requestChangeDonor = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    if (!reason) {
      return next(new AppError('Reason for changing donor is required', 400));
    }
    
    // Find blood request
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    // Check if user is the requester
    if (bloodRequest.requester.toString() !== userId) {
      return next(new AppError('You can only request to change donors for your own blood requests', 403));
    }
    
    // Check if request has an acceptor
    if (!bloodRequest.acceptedBy) {
      return next(new AppError('This blood request has not been accepted by any donor', 400));
    }
    
    // Check if request is in the right state
    if (bloodRequest.status !== 'accepted') {
      return next(new AppError(`Cannot change donor for a request with status: ${bloodRequest.status}`, 400));
    }
    
    // Get current donor info
    const currentDonor = await User.findById(bloodRequest.acceptedBy);
    
    // Update blood request
    bloodRequest.status = 'active'; // Reset to active
    bloodRequest.changeRequested = true;
    bloodRequest.changeReason = reason;
    
    // Store the previous donor ID temporarily (for notification)
    const previousDonorId = bloodRequest.acceptedBy;
    
    // Clear the acceptedBy field
    bloodRequest.acceptedBy = undefined;
    await bloodRequest.save();
    
    // Notify the previous donor
    if (previousDonorId) {
      const requesterUser = await User.findById(userId);
      
      await Notification.create({
        type: 'donor_changed',
        title: 'Donor Change Requested',
        user: previousDonorId,
        relatedUser: userId,
        message: `${requesterUser?.name} has requested a different donor for their blood request`,
        isRead: false
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Request to change donor submitted successfully',
      requestId: bloodRequest._id,
      status: bloodRequest.status
    });
  } catch (error) {
    logger.error('Error requesting donor change', error);
    next(new AppError('Failed to request donor change', 500));
  }
}; 