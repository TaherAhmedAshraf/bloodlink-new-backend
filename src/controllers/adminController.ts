import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import BloodRequest from '../models/BloodRequest';
import Notification, { NotificationType } from '../models/Notification';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Report from '../models/Report';  // Make sure this is at the top of the file

// Define a custom Request type that includes the user property
type AuthRequest = Request & { user?: { id: string } };

// Define interfaces for activity log
interface ActivityLogEntry {
  id: mongoose.Types.ObjectId;
  type: NotificationType;
  timestamp: Date;
  message: string;
  user: 'requester' | 'donor' | 'admin';
  metadata?: Record<string, any>;
}

// Define interfaces for populated documents
interface PopulatedUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  phoneNumber: string;
  bloodType?: string;
  address?: string;
}

interface PopulatedBloodRequest extends Omit<BloodRequestDocument, 'requester' | 'donor' | 'acceptedBy'> {
  requester: UserDocument;
  donor?: UserDocument;
  acceptedBy?: UserDocument;
  [key: string]: any;
}

// Add these interfaces at the top of the file with other interfaces

interface UserDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  phoneNumber: string;
  email?: string;
  bloodType?: string;
  address?: string;
  role: string;
  isVerified: boolean;
  isBlacklisted: boolean;
  reportCount?: number;
  createdAt: Date;
  lastLogin?: Date;
  notificationPreferences?: {
    bloodRequests: boolean;
    donationReminders: boolean;
    systemAnnouncements: boolean;
  };
  password?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  verificationDate?: Date;
  blacklistReason?: string;
  language?: string;
  locationSharing?: boolean;
}

interface BloodRequestDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  bloodType: string;
  hospital: string;
  location: string;
  status: string;
  isUrgent: boolean;
  createdAt: Date;
  updatedAt: Date;
  requester: mongoose.Types.ObjectId | UserDocument;
  donor?: mongoose.Types.ObjectId | UserDocument;
  acceptedBy?: mongoose.Types.ObjectId | UserDocument;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  units: number;
  notes?: string;
}

// First, let's add an interface for the report structure
interface ReportDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  reportedUser: mongoose.Types.ObjectId | UserDocument;
  reportedBy: mongoose.Types.ObjectId | UserDocument;
  reviewedBy?: mongoose.Types.ObjectId | UserDocument;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  adminNote?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Update the Report model type
interface ReportModel extends mongoose.Model<ReportDocument> {
  find: mongoose.Model<ReportDocument>['find'];
  findOne: mongoose.Model<ReportDocument>['findOne'];
  findById: mongoose.Model<ReportDocument>['findById'];
  updateOne: mongoose.Model<ReportDocument>['updateOne'];
}

// Helper function to check if an object is a populated document and not just an ObjectId
function isPopulatedDocument<T>(doc: any): doc is T {
  return doc && typeof doc === 'object' && doc._id && 
    typeof doc !== 'string' && !mongoose.Types.ObjectId.isValid(doc);
}

// Helper function to check if a document is a populated UserDocument
function isPopulatedUserDocument(doc: any): doc is UserDocument {
  return isPopulatedDocument<UserDocument>(doc) && 
    typeof doc.name === 'string' && 
    typeof doc.phoneNumber === 'string';
}

// Helper function to check if a document is a populated ReportDocument
function isPopulatedReportDocument(doc: any): doc is ReportDocument {
  return isPopulatedDocument<ReportDocument>(doc) && 
    typeof doc.reason === 'string' && 
    typeof doc.status === 'string';
}

// Helper function to check if a blood request is populated
function isPopulatedBloodRequest(doc: any): doc is PopulatedBloodRequest {
  return doc && 
    isPopulatedUserDocument(doc.requester) && 
    (!doc.donor || isPopulatedUserDocument(doc.donor)) &&
    (!doc.acceptedBy || isPopulatedUserDocument(doc.acceptedBy));
}

export const getReportedUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get reported users
    const reportedUsers = await User.find({ reportCount: { $gt: 0 } })
      .select('name phoneNumber reportCount isBlacklisted')
      .sort({ reportCount: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      count: reportedUsers.length,
      reportedUsers
    });
  } catch (error) {
    logger.error('Error fetching reported users', error);
    next(new AppError('Failed to fetch reported users', 500));
  }
};

export const getReportedUserDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: reportedUserId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get reported user details
    const reportedUser = await User.findById(reportedUserId)
      .select('name phoneNumber bloodType address reportCount isBlacklisted reportedRequests')
      .lean();
    
    if (!reportedUser) {
      return next(new AppError('User not found', 404));
    }
    
    // Get details of reported requests
    const reportedRequests = await BloodRequest.find({
      _id: { $in: reportedUser.reportedRequests || [] }
    })
    .select('bloodType hospital location date time reportReason')
    .lean();
    
    res.status(200).json({
      success: true,
      user: {
        ...reportedUser,
        reportedRequests: reportedRequests
      }
    });
  } catch (error) {
    logger.error('Error fetching reported user details', error);
    next(new AppError('Failed to fetch reported user details', 500));
  }
};

export const toggleUserBlacklist = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    // Find target user
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return next(new AppError('User not found', 404));
    }
    
    // Toggle blacklist status
    targetUser.isBlacklisted = !targetUser.isBlacklisted;
    await targetUser.save();
    
    // Create notification for the user
    await Notification.create({
      type: 'system_announcement',
      title: targetUser.isBlacklisted ? 'Account Restricted' : 'Account Restriction Removed',
      user: targetUser._id,
      message: targetUser.isBlacklisted 
        ? 'Your account has been restricted due to policy violations. Contact support for more information.'
        : 'The restriction on your account has been removed. You can now use all features of the app.',
      isRead: false
    });
    
    res.status(200).json({
      success: true,
      message: `User ${targetUser.isBlacklisted ? 'blacklisted' : 'removed from blacklist'} successfully`,
      userId: targetUser._id,
      isBlacklisted: targetUser.isBlacklisted
    });
  } catch (error) {
    logger.error('Error toggling user blacklist status', error);
    next(new AppError('Failed to update user blacklist status', 500));
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get query parameters for filtering
    const { 
      period = 'all',           // all, today, week, month, year
      startDate,                // YYYY-MM-DD format
      endDate,                  // YYYY-MM-DD format
      compareWithPrevious = 'false',
      specificMonth,            // YYYY-MM format
      specificYear,             // YYYY format
      specificDate,             // YYYY-MM-DD format
      dateRange                 // comma-separated dates: YYYY-MM-DD,YYYY-MM-DD
    } = req.query;
    
    // Prepare date filters based on the provided parameters
    let dateFilter: any = {};
    
    // Handle specific date selections
    if (specificDate) {
      dateFilter = getSpecificDateFilter(specificDate as string);
    } 
    // Handle specific month selection
    else if (specificMonth) {
      dateFilter = getSpecificMonthFilter(specificMonth as string);
    } 
    // Handle specific year selection
    else if (specificYear) {
      dateFilter = getSpecificYearFilter(specificYear as string);
    } 
    // Handle custom date range from dateRange parameter
    else if (dateRange) {
      const [rangeStart, rangeEnd] = (dateRange as string).split(',');
      if (rangeStart && rangeEnd) {
        dateFilter = getCustomDateRangeFilter(rangeStart, rangeEnd);
      }
    } 
    // Handle standard period or custom start/end dates
    else {
      dateFilter = getDateFilter(period as string, startDate as string, endDate as string);
    }
    
    let previousPeriodFilter;
    
    if (compareWithPrevious === 'true') {
      if (specificDate) {
        previousPeriodFilter = getPreviousSpecificDateFilter(specificDate as string);
      } else if (specificMonth) {
        previousPeriodFilter = getPreviousSpecificMonthFilter(specificMonth as string);
      } else if (specificYear) {
        previousPeriodFilter = getPreviousSpecificYearFilter(specificYear as string);
      } else if (dateRange) {
        const [rangeStart, rangeEnd] = (dateRange as string).split(',');
        if (rangeStart && rangeEnd) {
          previousPeriodFilter = getPreviousCustomDateRangeFilter(rangeStart, rangeEnd);
        }
      } else {
        previousPeriodFilter = getPreviousPeriodFilter(period as string, startDate as string, endDate as string);
      }
    }
    
    // Get basic stats
    const stats = await getBasicStats(dateFilter);
    
    // Get comparison stats if requested
    let comparisonStats;
    if (previousPeriodFilter) {
      comparisonStats = await getBasicStats(previousPeriodFilter);
    }
    
    // Get blood type distribution
    const bloodTypeDistribution = await getBloodTypeDistribution(dateFilter);
    
    // Get request status distribution
    const requestStatusDistribution = await getRequestStatusDistribution(dateFilter);
    
    // Get time series data based on period
    const timeSeriesData = await getTimeSeriesData(
      specificDate ? 'day' : 
      specificMonth ? 'month' : 
      specificYear ? 'year' : 
      period as string, 
      dateFilter
    );
    
    // Get recent blood requests
    const recentRequests = await BloodRequest.find(dateFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('requester', 'name phoneNumber')
      .lean();
    
    res.status(200).json({
      success: true,
      period: specificDate ? 'specific-date' : 
              specificMonth ? 'specific-month' : 
              specificYear ? 'specific-year' : 
              dateRange ? 'custom-range' : period,
      dateRange: {
        start: dateFilter.createdAt?.$gte ? new Date(dateFilter.createdAt.$gte).toISOString() : null,
        end: dateFilter.createdAt?.$lte ? new Date(dateFilter.createdAt.$lte).toISOString() : null
      },
      stats,
      comparisonStats: comparisonStats ? {
        ...comparisonStats,
        percentageChanges: calculatePercentageChanges(stats, comparisonStats)
      } : null,
      distributions: {
        bloodTypes: bloodTypeDistribution,
        requestStatus: requestStatusDistribution
      },
      timeSeriesData,
      recentRequests: recentRequests.map(req => ({
        id: req._id,
        bloodType: req.bloodType,
        hospital: req.hospital,
        location: req.location,
        status: req.status,
        date: req.date,
        requester: (req.requester as any)?.name || 'Unknown'
      }))
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats', error);
    next(new AppError('Failed to fetch dashboard statistics', 500));
  }
};

// Helper function to get date filter based on period
const getDateFilter = (period: string, startDate?: string, endDate?: string): any => {
  const now = new Date();
  const filter: any = {};
  
  if (startDate && endDate) {
    // Custom date range
    filter.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
    return filter;
  }
  
  switch (period) {
    case 'today':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filter.createdAt = { $gte: today };
      break;
      
    case 'week':
      const weekStart = new Date();
      weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
      filter.createdAt = { $gte: weekStart };
      break;
      
    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      filter.createdAt = { $gte: monthStart };
      break;
      
    case 'year':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      filter.createdAt = { $gte: yearStart };
      break;
      
    default:
      // 'all' or any other value - no date filter
      break;
  }
  
  return filter;
};

// Helper function to get previous period filter
const getPreviousPeriodFilter = (period: string, startDate?: string, endDate?: string): any => {
  const filter: any = {};
  
  if (startDate && endDate) {
    // Custom date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end.getTime() - start.getTime();
    
    filter.createdAt = {
      $gte: new Date(start.getTime() - duration),
      $lte: new Date(start)
    };
    return filter;
  }
  
  const now = new Date();
  
  switch (period) {
    case 'today':
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date();
      yesterdayEnd.setDate(now.getDate() - 1);
      yesterdayEnd.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: yesterday, $lte: yesterdayEnd };
      break;
      
    case 'week':
      const previousWeekStart = new Date();
      previousWeekStart.setDate(now.getDate() - now.getDay() - 7);
      previousWeekStart.setHours(0, 0, 0, 0);
      const previousWeekEnd = new Date();
      previousWeekEnd.setDate(now.getDate() - now.getDay() - 1);
      previousWeekEnd.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: previousWeekStart, $lte: previousWeekEnd };
      break;
      
    case 'month':
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      previousMonthEnd.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: previousMonthStart, $lte: previousMonthEnd };
      break;
      
    case 'year':
      const previousYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const previousYearEnd = new Date(now.getFullYear() - 1, 11, 31);
      previousYearEnd.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: previousYearStart, $lte: previousYearEnd };
      break;
      
    default:
      // 'all' - no comparison possible
      break;
  }
  
  return filter;
};

// Helper function to get basic stats
const getBasicStats = async (dateFilter: any) => {
  // Get total users count
  const totalUsers = await User.countDocuments({
    ...dateFilter
  });
  
  // Get new users count (registered in the period)
  const newUsers = dateFilter.createdAt ? await User.countDocuments(dateFilter) : totalUsers;
  
  // Get total blood requests count
  const totalRequests = await BloodRequest.countDocuments({
    ...dateFilter
  });
  
  // Get active blood requests count
  const activeRequests = await BloodRequest.countDocuments({
    ...dateFilter,
    status: 'active'
  });
  
  // Get completed blood requests count
  const completedRequests = await BloodRequest.countDocuments({
    ...dateFilter,
    status: 'completed'
  });
  
  // Get cancelled blood requests count
  const cancelledRequests = await BloodRequest.countDocuments({
    ...dateFilter,
    status: 'cancelled'
  });
  
  // Get blacklisted users count
  const blacklistedUsers = await User.countDocuments({
    ...dateFilter,
    isBlacklisted: true
  });
  
  // Get reported users count
  const reportedUsers = await User.countDocuments({
    ...dateFilter,
    reportCount: { $gt: 0 }
  });
  
  return {
    totalUsers,
    newUsers,
    totalRequests,
    activeRequests,
    completedRequests,
    cancelledRequests,
    blacklistedUsers,
    reportedUsers
  };
};

// Helper function to calculate percentage changes
const calculatePercentageChanges = (current: any, previous: any) => {
  const changes: Record<string, number> = {};
  
  for (const key in current) {
    if (previous[key] === 0) {
      changes[key] = current[key] > 0 ? 100 : 0;
    } else {
      changes[key] = Math.round(((current[key] - previous[key]) / previous[key]) * 100);
    }
  }
  
  return changes;
};

// Helper function to get blood type distribution
const getBloodTypeDistribution = async (dateFilter: any) => {
  const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const distribution: Record<string, number> = {};
  
  for (const bloodType of bloodTypes) {
    distribution[bloodType] = await BloodRequest.countDocuments({
      ...dateFilter,
      bloodType
    });
  }
  
  return distribution;
};

// Helper function to get request status distribution
const getRequestStatusDistribution = async (dateFilter: any) => {
  const statuses = ['active', 'accepted', 'completed', 'cancelled'];
  const distribution: Record<string, number> = {};
  
  for (const status of statuses) {
    distribution[status] = await BloodRequest.countDocuments({
      ...dateFilter,
      status
    });
  }
  
  return distribution;
};

// Helper function to get time series data
const getTimeSeriesData = async (period: string, dateFilter: any) => {
  if (!dateFilter.createdAt) {
    // For 'all' period, return monthly data for the past year
    return getMonthlyDataForPastYear();
  }
  
  switch (period) {
    case 'today':
      return getHourlyData(dateFilter);
    case 'week':
      return getDailyData(dateFilter);
    case 'month':
      return getDailyData(dateFilter);
    case 'year':
      return getMonthlyData(dateFilter);
    default:
      return [];
  }
};

// Helper function to get hourly data
const getHourlyData = async (dateFilter: any) => {
  const data = [];
  const startDate = new Date(dateFilter.createdAt.$gte);
  const endDate = dateFilter.createdAt.$lte ? new Date(dateFilter.createdAt.$lte) : new Date();
  
  for (let hour = 0; hour < 24; hour++) {
    const hourStart = new Date(startDate);
    hourStart.setHours(hour, 0, 0, 0);
    
    const hourEnd = new Date(startDate);
    hourEnd.setHours(hour, 59, 59, 999);
    
    // Skip future hours
    if (hourStart > endDate) break;
    
    const requests = await BloodRequest.countDocuments({
      createdAt: { $gte: hourStart, $lte: hourEnd }
    });
    
    const users = await User.countDocuments({
      createdAt: { $gte: hourStart, $lte: hourEnd }
    });
    
    data.push({
      time: `${hour}:00`,
      requests,
      users
    });
  }
  
  return data;
};

// Helper function to get daily data
const getDailyData = async (dateFilter: any) => {
  const data = [];
  const startDate = new Date(dateFilter.createdAt.$gte);
  const endDate = dateFilter.createdAt.$lte ? new Date(dateFilter.createdAt.$lte) : new Date();
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(startDate);
    dayStart.setDate(startDate.getDate() + i);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    
    const requests = await BloodRequest.countDocuments({
      createdAt: { $gte: dayStart, $lte: dayEnd }
    });
    
    const users = await User.countDocuments({
      createdAt: { $gte: dayStart, $lte: dayEnd }
    });
    
    data.push({
      date: dayStart.toISOString().split('T')[0],
      requests,
      users
    });
  }
  
  return data;
};

// Helper function to get monthly data
const getMonthlyData = async (dateFilter: any) => {
  const data = [];
  const startDate = new Date(dateFilter.createdAt.$gte);
  const endDate = dateFilter.createdAt.$lte ? new Date(dateFilter.createdAt.$lte) : new Date();
  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                 endDate.getMonth() - startDate.getMonth() + 1;
  
  for (let i = 0; i < months; i++) {
    const monthStart = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    
    const requests = await BloodRequest.countDocuments({
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    const users = await User.countDocuments({
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    data.push({
      month: monthStart.toISOString().split('T')[0].substring(0, 7),
      requests,
      users
    });
  }
  
  return data;
};

// Helper function to get monthly data for the past year
const getMonthlyDataForPastYear = async () => {
  const data = [];
  const now = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(now.getFullYear() - 1);
  
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(yearAgo.getFullYear(), yearAgo.getMonth() + i, 1);
    const monthEnd = new Date(yearAgo.getFullYear(), yearAgo.getMonth() + i + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    
    const requests = await BloodRequest.countDocuments({
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    const users = await User.countDocuments({
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    data.push({
      month: monthStart.toISOString().split('T')[0].substring(0, 7),
      requests,
      users
    });
  }
  
  return data;
};

// Helper function to get filter for a specific date
const getSpecificDateFilter = (dateString: string): any => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  
  return {
    createdAt: {
      $gte: date,
      $lt: nextDay
    }
  };
};

// Helper function to get filter for a specific month
const getSpecificMonthFilter = (monthString: string): any => {
  // monthString format: YYYY-MM
  const [year, month] = monthString.split('-').map(num => parseInt(num));
  
  const startDate = new Date(year, month - 1, 1); // Month is 0-indexed in JS Date
  const endDate = new Date(year, month, 0); // Last day of the month
  endDate.setHours(23, 59, 59, 999);
  
  return {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
};

// Helper function to get filter for a specific year
const getSpecificYearFilter = (yearString: string): any => {
  const year = parseInt(yearString);
  
  const startDate = new Date(year, 0, 1); // January 1st
  const endDate = new Date(year, 11, 31); // December 31st
  endDate.setHours(23, 59, 59, 999);
  
  return {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
};

// Helper function to get filter for a custom date range
const getCustomDateRangeFilter = (startDateString: string, endDateString: string): any => {
  const startDate = new Date(startDateString);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(endDateString);
  endDate.setHours(23, 59, 59, 999);
  
  return {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
};

// Helper function to get previous specific date filter
const getPreviousSpecificDateFilter = (dateString: string): any => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  
  const previousDate = new Date(date);
  previousDate.setDate(date.getDate() - 1);
  
  const previousDateEnd = new Date(previousDate);
  previousDateEnd.setHours(23, 59, 59, 999);
  
  return {
    createdAt: {
      $gte: previousDate,
      $lte: previousDateEnd
    }
  };
};

// Helper function to get previous specific month filter
const getPreviousSpecificMonthFilter = (monthString: string): any => {
  // monthString format: YYYY-MM
  const [year, month] = monthString.split('-').map(num => parseInt(num));
  
  let prevYear = year;
  let prevMonth = month - 1;
  
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear--;
  }
  
  const startDate = new Date(prevYear, prevMonth - 1, 1);
  const endDate = new Date(prevYear, prevMonth, 0);
  endDate.setHours(23, 59, 59, 999);
  
  return {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
};

// Helper function to get previous specific year filter
const getPreviousSpecificYearFilter = (yearString: string): any => {
  const year = parseInt(yearString) - 1;
  
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  endDate.setHours(23, 59, 59, 999);
  
  return {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
};

// Helper function to get previous custom date range filter
const getPreviousCustomDateRangeFilter = (startDateString: string, endDateString: string): any => {
  const startDate = new Date(startDateString);
  const endDate = new Date(endDateString);
  
  const duration = endDate.getTime() - startDate.getTime();
  
  const previousStartDate = new Date(startDate.getTime() - duration);
  const previousEndDate = new Date(startDate.getTime() - 1);
  
  return {
    createdAt: {
      $gte: previousStartDate,
      $lte: previousEndDate
    }
  };
};

export const sendSystemAnnouncement = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title, message, targetUserIds } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    if (!title || !message) {
      return next(new AppError('Title and message are required', 400));
    }
    
    let userQuery = {};
    
    // If specific users are targeted
    if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      userQuery = { _id: { $in: targetUserIds } };
    }
    
    // Get users to send announcement to
    const users = await User.find(userQuery).select('_id');
    
    if (users.length === 0) {
      return next(new AppError('No users found to send announcement to', 404));
    }
    
    // Create notifications for all users
    const notifications = users.map(user => ({
      type: 'system_announcement',
      title,
      user: user._id,
      message,
      isRead: false
    }));
    
    await Notification.insertMany(notifications);
    
    res.status(200).json({
      success: true,
      message: `System announcement sent to ${users.length} users`,
      recipientCount: users.length
    });
  } catch (error) {
    logger.error('Error sending system announcement', error);
    next(new AppError('Failed to send system announcement', 500));
  }
};

// Get all blood requests with advanced filtering and pagination
export const getAllBloodRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Extract query parameters
    const {
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      bloodType,
      hospital,
      location,
      startDate,
      endDate,
      search,
      requesterName,
      urgent
    } = req.query;
    
    // Build filter object
    const filter: any = {};
    
    // Filter by status
    if (status) {
      filter.status = status;
    }
    
    // Filter by blood type
    if (bloodType) {
      filter.bloodType = bloodType;
    }
    
    // Filter by hospital (partial match)
    if (hospital) {
      filter.hospital = { $regex: hospital, $options: 'i' };
    }
    
    // Filter by location (partial match)
    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }
    
    // Filter by date range
    if (startDate || endDate) {
      filter.createdAt = {};
      
      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    
    // Search in multiple fields
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { hospital: searchRegex },
        { location: searchRegex },
        { patientName: searchRegex },
        { notes: searchRegex }
      ];
    }
    
    // Filter by requester name (requires aggregation)
    let requesters: any[] = [];
    if (requesterName) {
      requesters = await User.find({
        name: { $regex: requesterName, $options: 'i' }
      }).select('_id').lean();
      
      if (requesters.length > 0) {
        filter.requester = { $in: requesters.map(r => r._id) };
      } else {
        // No matching requesters, return empty result
        return res.status(200).json({
          success: true,
          count: 0,
          total: 0,
          totalPages: 0,
          currentPage: 1,
          bloodRequests: []
        });
      }
    }
    
    // Filter by urgency
    if (urgent === 'true') {
      filter.isUrgent = true;
    } else if (urgent === 'false') {
      filter.isUrgent = false;
    }
    
    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await BloodRequest.countDocuments(filter);
    
    // Get blood requests with populated requester and donor
    const bloodRequests = await BloodRequest.find(filter)
      .populate('requester', 'name phoneNumber')
      .populate('donor', 'name phoneNumber bloodType')
      .populate('acceptedBy', 'name phoneNumber bloodType')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    // Format response
    const formattedRequests = bloodRequests.map(req => {
      // Determine the donor (use either donor or acceptedBy field)
      const donorInfo = req.donor || req.acceptedBy || null;
      
      return {
        id: req._id,
        bloodType: req.bloodType,
        hospital: req.hospital,
        location: req.location,
        patientName: req.patientName,
        status: req.status,
        isUrgent: req.isUrgent,
        date: req.date,
        time: req.time,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        requester: isPopulatedUserDocument(req.requester) ? {
          id: req.requester._id,
          name: req.requester.name,
          phoneNumber: req.requester.phoneNumber
        } : null,
        donor: donorInfo && isPopulatedUserDocument(donorInfo) ? {
          id: donorInfo._id,
          name: donorInfo.name,
          phoneNumber: donorInfo.phoneNumber,
          bloodType: donorInfo.bloodType
        } : null
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedRequests.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      bloodRequests: formattedRequests
    });
  } catch (error) {
    logger.error('Error fetching blood requests', error);
    next(new AppError('Failed to fetch blood requests', 500));
  }
};

// Get blood request details
export const getBloodRequestDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get the blood request with populated fields
    const bloodRequest = await BloodRequest.findById(requestId)
      .populate('requester')
      .populate('donor')
      .populate('acceptedBy')
      .lean() as PopulatedBloodRequest;

    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }

    // Determine the donor (use either donor or acceptedBy field)
    const donorInfo = bloodRequest.donor || bloodRequest.acceptedBy || null;
    
    // Get activity log
    const notifications = await Notification.find({
      bloodRequest: new mongoose.Types.ObjectId(requestId)
    }).sort({ createdAt: 1 }).lean();
    
    // Convert notifications to activity log format
    const activityLog: ActivityLogEntry[] = notifications.map(notification => ({
      id: notification._id,
      type: notification.type,
      timestamp: notification.createdAt,
      message: notification.message,
      user: determineUserType(notification, bloodRequest),
      metadata: notification.metadata
    }));
    
    res.status(200).json({
      success: true,
      bloodRequest: {
        id: bloodRequest._id,
        bloodType: bloodRequest.bloodType,
        hospital: bloodRequest.hospital,
        location: bloodRequest.location,
        patientName: bloodRequest.patientName,
        patientAge: bloodRequest.patientAge,
        patientGender: bloodRequest.patientGender,
        units: bloodRequest.units,
        notes: bloodRequest.notes,
        status: bloodRequest.status,
        isUrgent: bloodRequest.isUrgent,
        date: bloodRequest.date,
        time: bloodRequest.time,
        bagNeeded: bloodRequest.bagNeeded,
        zone: bloodRequest.zone,
        hemoglobinPoint: bloodRequest.hemoglobinPoint,
        patientProblem: bloodRequest.patientProblem,
        additionalInfo: bloodRequest.additionalInfo,
        createdAt: bloodRequest.createdAt,
        updatedAt: bloodRequest.updatedAt,
        requester: isPopulatedUserDocument(bloodRequest.requester) ? {
          id: bloodRequest.requester._id,
          name: bloodRequest.requester.name,
          phoneNumber: bloodRequest.requester.phoneNumber,
          bloodType: bloodRequest.requester.bloodType,
          address: bloodRequest.requester.address
        } : null,
        donor: donorInfo && isPopulatedUserDocument(donorInfo) ? {
          id: donorInfo._id,
          name: donorInfo.name,
          phoneNumber: donorInfo.phoneNumber,
          bloodType: donorInfo.bloodType
        } : null
      },
      activityLog
    });
  } catch (error) {
    logger.error('Error fetching blood request details', error);
    next(new AppError('Failed to fetch blood request details', 500));
  }
};

// Helper function to determine user type for activity log
const determineUserType = (
  notification: any, 
  bloodRequest: PopulatedBloodRequest
): 'requester' | 'donor' | 'admin' => {
  if (isPopulatedDocument(bloodRequest.requester) && 
      notification.user.toString() === bloodRequest.requester._id.toString()) {
    return 'requester';
  }
  
  if (bloodRequest.donor && isPopulatedDocument(bloodRequest.donor) && 
      notification.user.toString() === bloodRequest.donor._id.toString()) {
    return 'donor';
  }
  
  return 'admin';
};

// Update blood request status with enhanced functionality
export const updateBloodRequestStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const { 
      status, 
      adminNote, 
      donorPhoneNumber, 
      donorName,
      donorAction = 'none', // none, assign, remove
      patientName,
      units
    } = req.body;
    
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const admin = await User.findById(userId);
    if (admin?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    // Find the blood request without updating it yet
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    // Handle donor assignment/removal
    if (donorAction === 'assign') {
      // Validate donor information
      if (!donorPhoneNumber) {
        return next(new AppError('Donor phone number is required when assigning a donor', 400));
      }
      
      // Find or create donor
      let donor = await User.findOne({ phoneNumber: donorPhoneNumber });
      
      if (!donor) {
        // If donor doesn't exist and name is provided, create a new user
        if (!donorName) {
          return next(new AppError('Donor name is required for new donors', 400));
        }
        
        // Create a temporary password (user will need to reset)
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        donor = await User.create({
          name: donorName,
          phoneNumber: donorPhoneNumber,
          password: hashedPassword,
          role: 'user',
          isVerified: true // Admin-created users are verified by default
        });
        
        // Send notification to new user
        await Notification.create({
          type: 'system_announcement',
          title: 'Account Created by Admin',
          user: donor._id,
          message: `An administrator has created an account for you and assigned you as a donor. Please reset your password.`,
          isRead: false
        });
      }
      
      // Assign donor to request
      bloodRequest.donor = donor._id;
      bloodRequest.acceptedBy = donor._id;
      
      // If status is not explicitly set to something else, set it to accepted
      if (!status) {
        bloodRequest.status = 'accepted';
      } else if (status === 'active') {
        // Cannot have donor assigned if status is active
        return next(new AppError('Cannot assign a donor and set status to active at the same time', 400));
      }
      
      // Notify donor
      await Notification.create({
        type: 'admin_update',
        title: 'Assigned as Donor',
        user: donor._id,
        bloodRequest: bloodRequest._id,
        message: `An administrator has assigned you as a donor for a blood request at ${bloodRequest.hospital}.`,
        isRead: false
      });
    } else if (donorAction === 'remove') {
      // Store donor ID before removal for notification
      const previousDonorId = bloodRequest.donor || bloodRequest.acceptedBy;
      
      // Remove donor from request
      bloodRequest.donor = undefined;
      bloodRequest.acceptedBy = undefined;
      
      // If status is not explicitly set to something else, set it to active
      if (!status) {
        bloodRequest.status = 'active';
      }
      
      // Notify previous donor if exists
      if (previousDonorId) {
        await Notification.create({
          type: 'admin_update',
          title: 'Donor Assignment Removed',
          user: previousDonorId,
          bloodRequest: bloodRequest._id,
          message: `An administrator has removed you as a donor from a blood request at ${bloodRequest.hospital}.`,
          isRead: false
        });
      }
    }
    
    // Update status if provided
    if (status) {
      bloodRequest.status = status;
      
      // If marking as completed, set completedAt
      if (status === 'completed' && !bloodRequest.completedAt) {
        bloodRequest.completedAt = new Date();
      }
      
      // If setting to active, ensure no donor is assigned
      if (status === 'active' && donorAction !== 'remove') {
        // Store donor ID before removal for notification
        const previousDonorId = bloodRequest.donor || bloodRequest.acceptedBy;
        
        // Remove donor from request
        bloodRequest.donor = undefined;
        bloodRequest.acceptedBy = undefined;
        
        // Notify previous donor if exists
        if (previousDonorId) {
          await Notification.create({
            type: 'admin_update',
            title: 'Donor Assignment Removed',
            user: previousDonorId,
            bloodRequest: bloodRequest._id,
            message: `An administrator has set this blood request to active status, removing you as the donor.`,
            isRead: false
          });
        }
      }
    }
    
    // Add admin note if provided
    if (adminNote) {
      if (!bloodRequest.adminNotes) {
        bloodRequest.adminNotes = [];
      }
      
      bloodRequest.adminNotes.push({
        note: adminNote,
        timestamp: new Date(),
        adminId: new mongoose.Types.ObjectId(userId)
      });
    }
    
    // Update patient name and units if provided
    if (patientName) {
      bloodRequest.patientName = patientName;
    }
    
    if (units) {
      bloodRequest.units = units;
    }
    
    // Validate the request before saving
    try {
      // Use findByIdAndUpdate to avoid validation issues with required fields
      // This will only update the fields we've modified
      const updatedRequest = await BloodRequest.findByIdAndUpdate(
        requestId,
        {
          $set: {
            status: bloodRequest.status,
            donor: bloodRequest.donor,
            acceptedBy: bloodRequest.acceptedBy,
            completedAt: bloodRequest.completedAt,
            adminNotes: bloodRequest.adminNotes,
            ...(patientName && { patientName }),
            ...(units && { units })
          }
        },
        { new: true, runValidators: false }
      )
      .populate('donor', 'name phoneNumber bloodType')
      .populate('acceptedBy', 'name phoneNumber bloodType');
      
      if (!updatedRequest) {
        return next(new AppError('Failed to update blood request', 500));
      }
      
      // Determine the donor (use either donor or acceptedBy field)
      const donorInfo = updatedRequest.donor || updatedRequest.acceptedBy || null;
      
      // Create notification for requester
      await Notification.create({
        type: 'admin_update',
        title: getNotificationTitle(status, donorAction),
        user: bloodRequest.requester,
        bloodRequest: bloodRequest._id,
        message: getRequesterNotificationMessage(status, donorAction, bloodRequest),
        metadata: {
          updatedBy: userId,
          previousStatus: bloodRequest.status,
          newStatus: status,
          donorAction
        }
      });
      
      // If there's a donor and we're not removing them, notify them too
      if (bloodRequest.donor && donorAction !== 'remove' && status !== 'active') {
        await Notification.create({
          type: 'admin_update',
          title: getNotificationTitle(status, donorAction),
          user: bloodRequest.donor,
          bloodRequest: bloodRequest._id,
          message: getDonorNotificationMessage(status, donorAction, bloodRequest),
          metadata: {
            updatedBy: userId,
            previousStatus: bloodRequest.status,
            newStatus: status,
            donorAction
          }
        });
      }
      
      res.status(200).json({
        success: true,
        message: getSuccessMessage(status, donorAction),
        bloodRequest: {
          id: updatedRequest._id,
          status: updatedRequest.status,
          donor: donorInfo && isPopulatedUserDocument(donorInfo) ? {
            id: donorInfo._id,
            name: donorInfo.name,
            phoneNumber: donorInfo.phoneNumber,
            bloodType: donorInfo.bloodType
          } : null,
          updatedAt: updatedRequest.updatedAt
        }
      });
    } catch (validationError) {
      logger.error('Error updating blood request status', validationError);
      return next(new AppError(`Failed to update blood request: ${(validationError as Error).message}`, 400));
    }
  } catch (error) {
    logger.error('Error updating blood request status', error);
    next(new AppError('Failed to update blood request status', 500));
  }
};

// Helper functions for notification messages
const getNotificationTitle = (status?: string, donorAction?: string): string => {
  if (donorAction === 'assign') {
    return 'Donor Assigned by Admin';
  } else if (donorAction === 'remove') {
    return 'Donor Removed by Admin';
  } else if (status) {
    return `Blood Request ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  } else {
    return 'Blood Request Updated';
  }
};

const getRequesterNotificationMessage = (status?: string, donorAction?: string, bloodRequest?: any): string => {
  if (donorAction === 'assign') {
    return `An administrator has assigned a donor to your blood request at ${bloodRequest.hospital}.`;
  } else if (donorAction === 'remove') {
    return `An administrator has removed the donor from your blood request at ${bloodRequest.hospital}.`;
  } else if (status) {
    return `Your blood request has been marked as ${status} by an administrator.`;
  } else {
    return 'Your blood request has been updated by an administrator.';
  }
};

const getDonorNotificationMessage = (status?: string, donorAction?: string, bloodRequest?: any): string => {
  if (donorAction === 'assign') {
    return `An administrator has assigned you as a donor for a blood request at ${bloodRequest.hospital}.`;
  } else if (status) {
    return `A blood request you accepted has been marked as ${status} by an administrator.`;
  } else {
    return 'A blood request you accepted has been updated by an administrator.';
  }
};

const getSuccessMessage = (status?: string, donorAction?: string): string => {
  if (donorAction === 'assign') {
    return 'Donor assigned successfully';
  } else if (donorAction === 'remove') {
    return 'Donor removed successfully';
  } else if (status) {
    return `Blood request status updated to ${status}`;
  } else {
    return 'Blood request updated successfully';
  }
};

// Delete a blood request
export const deleteBloodRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    // Find the blood request
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return next(new AppError('Blood request not found', 404));
    }
    
    // Store requester and donor IDs before deletion
    const requesterId = bloodRequest.requester;
    const donorId = bloodRequest.donor;
    
    // Delete the blood request
    await BloodRequest.findByIdAndDelete(requestId);
    
    // Delete associated notifications
    await Notification.deleteMany({ bloodRequest: requestId });
    
    // Notify requester
    if (requesterId) {
      await Notification.create({
        type: 'admin_update',
        title: 'Blood Request Deleted',
        user: requesterId,
        message: 'Your blood request has been deleted by an administrator.',
        isRead: false,
        metadata: {
          requestId,
          deletedBy: 'admin'
        }
      });
    }
    
    // Notify donor if exists
    if (donorId) {
      await Notification.create({
        type: 'admin_update',
        title: 'Blood Request Deleted',
        user: donorId,
        message: 'A blood request you accepted has been deleted by an administrator.',
        isRead: false,
        metadata: {
          requestId,
          deletedBy: 'admin'
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Blood request deleted successfully',
      requestId
    });
  } catch (error) {
    logger.error('Error deleting blood request', error);
    next(new AppError('Failed to delete blood request', 500));
  }
};

// Get blood request statistics
export const getBloodRequestStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const user = await User.findById(userId);
    if (user?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get query parameters for filtering
    const { startDate, endDate } = req.query;
    
    // Prepare date filter
    const dateFilter: any = {};
    
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      
      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.createdAt.$gte = start;
      }
      
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }
    
    // Get counts by status
    const statusCounts = {
      active: await BloodRequest.countDocuments({ ...dateFilter, status: 'active' }),
      accepted: await BloodRequest.countDocuments({ ...dateFilter, status: 'accepted' }),
      completed: await BloodRequest.countDocuments({ ...dateFilter, status: 'completed' }),
      cancelled: await BloodRequest.countDocuments({ ...dateFilter, status: 'cancelled' })
    };
    
    // Get counts by blood type
    const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const bloodTypeCounts: Record<string, number> = {};
    
    for (const bloodType of bloodTypes) {
      bloodTypeCounts[bloodType] = await BloodRequest.countDocuments({
        ...dateFilter,
        bloodType
      });
    }
    
    // Get urgent vs. non-urgent counts
    const urgentCount = await BloodRequest.countDocuments({
      ...dateFilter,
      isUrgent: true
    });
    
    const nonUrgentCount = await BloodRequest.countDocuments({
      ...dateFilter,
      isUrgent: false
    });
    
    // Get average time to completion
    const completedRequests = await BloodRequest.find({
      ...dateFilter,
      status: 'completed'
    }).lean();
    
    let avgCompletionTime = 0;
    
    if (completedRequests.length > 0) {
      const totalCompletionTime = completedRequests.reduce((sum, req) => {
        const createdAt = new Date(req.createdAt).getTime();
        const updatedAt = new Date(req.updatedAt).getTime();
        return sum + (updatedAt - createdAt);
      }, 0);
      
      // Average time in hours
      avgCompletionTime = totalCompletionTime / completedRequests.length / (1000 * 60 * 60);
    }
    
    res.status(200).json({
      success: true,
      dateRange: {
        start: dateFilter.createdAt?.$gte ? dateFilter.createdAt.$gte.toISOString() : null,
        end: dateFilter.createdAt?.$lte ? dateFilter.createdAt.$lte.toISOString() : null
      },
      totalRequests: statusCounts.active + statusCounts.accepted + statusCounts.completed + statusCounts.cancelled,
      statusCounts,
      bloodTypeCounts,
      urgencyStats: {
        urgent: urgentCount,
        nonUrgent: nonUrgentCount,
        urgentPercentage: Math.round((urgentCount / (urgentCount + nonUrgentCount || 1)) * 100)
      },
      completionStats: {
        avgCompletionTimeHours: Math.round(avgCompletionTime * 100) / 100,
        completedCount: completedRequests.length
      }
    });
  } catch (error) {
    logger.error('Error fetching blood request statistics', error);
    next(new AppError('Failed to fetch blood request statistics', 500));
  }
};

// Get all users with pagination and filtering
export const getAllUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const admin = await User.findById(userId);
    if (admin?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Extract query parameters
    const {
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      name,
      phoneNumber,
      bloodType,
      isVerified,
      isBlacklisted,
      role,
      startDate,
      endDate
    } = req.query;
    
    // Build filter object
    const filter: any = {};
    
    // Filter by name (partial match)
    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }
    
    // Filter by phone number (partial match)
    if (phoneNumber) {
      filter.phoneNumber = { $regex: phoneNumber, $options: 'i' };
    }
    
    // Filter by blood type
    if (bloodType) {
      filter.bloodType = bloodType;
    }
    
    // Filter by verification status
    if (isVerified === 'true') {
      filter.isVerified = true;
    } else if (isVerified === 'false') {
      filter.isVerified = false;
    }
    
    // Filter by blacklist status
    if (isBlacklisted === 'true') {
      filter.isBlacklisted = true;
    } else if (isBlacklisted === 'false') {
      filter.isBlacklisted = false;
    }
    
    // Filter by role
    if (role) {
      filter.role = role;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      filter.createdAt = {};
      
      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    
    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    // Get users with pagination and sorting
    const users = await User.find(filter)
      .select('name phoneNumber bloodType role isVerified isBlacklisted reportCount createdAt lastLogin')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean() as UserDocument[];
    
    // Get additional stats for each user
    const usersWithStats = await Promise.all(users.map(async (user: UserDocument) => {
      const requestsCreated = await BloodRequest.countDocuments({ 
        requester: user._id 
      });
      
      const donationsMade = await BloodRequest.countDocuments({ 
        donor: user._id,
        status: 'completed'
      });
      
      const activeRequests = await BloodRequest.countDocuments({
        requester: user._id,
        status: 'active'
      });
      
      return {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        bloodType: user.bloodType,
        role: user.role,
        isVerified: user.isVerified,
        isBlacklisted: user.isBlacklisted,
        reportCount: user.reportCount || 0,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        stats: {
          requestsCreated,
          donationsMade,
          activeRequests
        }
      };
    }));
    
    res.status(200).json({
      success: true,
      count: usersWithStats.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      users: usersWithStats
    });
  } catch (error) {
    logger.error('Error fetching users', error);
    next(new AppError('Failed to fetch users', 500));
  }
};

// Get detailed information about a specific user
export const getUserDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const admin = await User.findById(userId);
    if (admin?.role !== 'admin') {
      return next(new AppError('You do not have permission to access this resource', 403));
    }
    
    // Get user details with populated fields
    const user = await User.findById(targetUserId)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .lean() as UserDocument;
    
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Get user reports with populated reporter information
    const reports = await (Report as unknown as ReportModel)
      .find({ reportedUser: targetUserId })
      .populate<{ reportedBy: UserDocument }>('reportedBy', 'name phoneNumber')
      .populate<{ reviewedBy: UserDocument }>('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Get blood donation history
    const bloodDonations = await BloodRequest.find({
      donor: targetUserId,
      status: { $in: ['completed', 'accepted'] }
    })
    .select('bloodType hospital location status createdAt updatedAt requester')
    .populate('requester', 'name phoneNumber')
    .sort({ createdAt: -1 })
    .lean() as PopulatedBloodRequest[];

    // Get blood request history
    const bloodRequests = await BloodRequest.find({
      requester: targetUserId
    })
    .select('bloodType hospital location status isUrgent createdAt updatedAt donor patientName')
    .populate('donor', 'name phoneNumber')
    .sort({ createdAt: -1 })
    .lean() as PopulatedBloodRequest[];

    // Calculate report statistics
    const reportStats = {
      totalReports: reports.length,
      pendingReports: reports.filter((r: any) => r.status === 'pending').length,
      dismissedReports: reports.filter((r: any) => r.status === 'dismissed').length,
      reviewedReports: reports.filter((r: any) => r.status === 'reviewed').length,
      recentReports: reports.filter((r: any) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return new Date(r.createdAt) > thirtyDaysAgo;
      }).length,
      commonReasons: getCommonReasons(reports)
    };

    // Calculate statistics
    const stats = {
      totalRequests: bloodRequests.length,
      totalDonations: bloodDonations.filter(d => d.status === 'completed').length,
      pendingDonations: bloodDonations.filter(d => d.status === 'accepted').length,
      activeRequests: bloodRequests.filter(r => r.status === 'active').length,
      completedRequests: bloodRequests.filter(r => r.status === 'completed').length,
      cancelledRequests: bloodRequests.filter(r => r.status === 'cancelled').length,
      lastActivity: bloodRequests[0]?.createdAt || user.lastLogin || user.createdAt,
      lastRequestDate: bloodRequests[0]?.createdAt || null,
      lastDonationDate: bloodDonations.find(d => d.status === 'completed')?.createdAt || null,
      responseRate: calculateResponseRate(bloodRequests as unknown as BloodRequestDocument[]),
      completionRate: calculateCompletionRate(bloodDonations as unknown as BloodRequestDocument[])
    };

    // Format response
    const userDetails = {
      personalInfo: {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        bloodType: user.bloodType,
        address: user.address,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      accountStatus: {
        isVerified: user.isVerified,
        isBlacklisted: user.isBlacklisted,
        reportCount: reports.length,
        verificationDate: user.verificationDate,
        blacklistReason: user.blacklistReason,
        reportStats
      },
      reports: reports.map(report => ({
        id: report._id,
        reason: report.reason,
        description: report.description,
        status: report.status,
        reportedBy: isPopulatedDocument<UserDocument>(report.reportedBy) ? {
          id: report.reportedBy._id,
          name: report.reportedBy.name,
          phoneNumber: report.reportedBy.phoneNumber
        } : null,
        createdAt: report.createdAt,
        adminNote: report.adminNote,
        reviewedBy: isPopulatedDocument<UserDocument>(report.reviewedBy) ? {
          id: report.reviewedBy._id,
          name: report.reviewedBy.name
        } : null,
        reviewedAt: report.reviewedAt
      })),
      preferences: {
        notifications: user.notificationPreferences || {
          bloodRequests: true,
          donationReminders: true,
          systemAnnouncements: true
        },
        language: user.language || 'en',
        locationSharing: user.locationSharing || false
      },
      stats,
      bloodRequests: bloodRequests.map(req => ({
        id: req._id,
        bloodType: req.bloodType,
        hospital: req.hospital,
        location: req.location,
        status: req.status,
        isUrgent: req.isUrgent,
        donor: isPopulatedUserDocument(req.donor) ? {
          id: req.donor._id,
          name: req.donor.name,
          phoneNumber: req.donor.phoneNumber
        } : null,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        patientName: req.patientName
      })),
      bloodDonations: bloodDonations.map(donation => ({
        id: donation._id,
        bloodType: donation.bloodType,
        hospital: donation.hospital,
        location: donation.location,
        status: donation.status,
        requester: isPopulatedUserDocument(donation.requester) ? {
          id: donation.requester._id,
          name: donation.requester.name,
          phoneNumber: donation.requester.phoneNumber
        } : null,
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt
      })),
      activityLog: bloodRequests.map(req => ({
        type: 'blood_request',
        message: req.patientName || '',
        timestamp: req.createdAt,
        metadata: {
          bloodType: req.bloodType,
          hospital: req.hospital,
          location: req.location,
          status: req.status,
          isUrgent: req.isUrgent
        }
      })),
      reportStats
    };
    
    res.status(200).json({
      success: true,
      user: userDetails
    });
  } catch (error) {
    logger.error('Error fetching user details:', error);
    next(new AppError('Failed to fetch user details', 500));
  }
};

// Helper functions for statistics
const calculateResponseRate = (requests: BloodRequestDocument[]): number => {
  if (requests.length === 0) return 0;
  const respondedRequests = requests.filter(r => r.donor || r.status !== 'active');
  return (respondedRequests.length / requests.length) * 100;
};

const calculateCompletionRate = (donations: BloodRequestDocument[]): number => {
  const acceptedDonations = donations.filter(d => ['completed', 'accepted'].includes(d.status));
  if (acceptedDonations.length === 0) return 0;
  const completedDonations = donations.filter(d => d.status === 'completed');
  return (completedDonations.length / acceptedDonations.length) * 100;
};

// Helper function to get common report reasons
const getCommonReasons = (reports: ReportDocument[]): Array<{ reason: string; count: number }> => {
  const reasonCounts = reports.reduce((acc, report) => {
    const reason = isPopulatedReportDocument(report) ? report.reason : '';
    if (reason) {
      acc[reason] = (acc[reason] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
};

// Update user details
export const updateUserDetails = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: targetUserId } = req.params;
    const {
      name,
      phoneNumber,
      email,
      bloodType,
      address,
      isVerified,
      isBlacklisted,
      blacklistReason,
      notificationPreferences,
      language,
      locationSharing
    } = req.body;

    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const admin = await User.findById(userId);
    if (admin?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    // Find and update user
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      {
        $set: {
          ...(name && { name }),
          ...(phoneNumber && { phoneNumber }),
          ...(email && { email }),
          ...(bloodType && { bloodType }),
          ...(address && { address }),
          ...(typeof isVerified === 'boolean' && { 
            isVerified,
            ...(isVerified && { verificationDate: new Date() })
          }),
          ...(typeof isBlacklisted === 'boolean' && { 
            isBlacklisted,
            ...(blacklistReason && { blacklistReason })
          }),
          ...(notificationPreferences && { notificationPreferences }),
          ...(language && { language }),
          ...(typeof locationSharing === 'boolean' && { locationSharing })
        }
      },
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!updatedUser) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'User details updated successfully',
      user: updatedUser
    });
  } catch (error) {
    logger.error('Error updating user details:', error);
    next(new AppError('Failed to update user details', 500));
  }
};

// Add a new endpoint to handle report status updates
export const updateReportStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { reportId } = req.params;
    const { status, adminNote } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }

    // Check if user is admin
    const admin = await User.findById(userId);
    if (admin?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    // Update report status
    const report = await (Report as unknown as ReportModel).findByIdAndUpdate(
      reportId,
      {
        status,
        adminNote,
        reviewedBy: userId,
        reviewedAt: new Date()
      },
      { new: true }
    ).populate('reportedUser reportedBy', 'name phoneNumber');

    if (!report) {
      return next(new AppError('Report not found', 404));
    }

    // If report is marked as reviewed and there are multiple reports,
    // consider automatic blacklisting
    if (status === 'reviewed') {
      const reportCount = await (Report as unknown as ReportModel).countDocuments({
        reportedUser: report.reportedUser,
        status: 'reviewed'
      });

      if (reportCount >= 5) { // Threshold for automatic blacklisting
        await User.findByIdAndUpdate(report.reportedUser, {
          isBlacklisted: true,
          blacklistReason: 'Multiple verified reports against user'
        });

        // Notify user about blacklisting
        await Notification.create({
          type: 'system_announcement',
          title: 'Account Restricted',
          user: report.reportedUser,
          message: 'Your account has been restricted due to multiple verified reports.',
          isRead: false
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Report status updated successfully',
      report
    });
  } catch (error) {
    logger.error('Error updating report status:', error);
    next(new AppError('Failed to update report status', 500));
  }
};

// Add this function to handle user deletion
export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Check if user is admin
    const admin = await User.findById(userId);
    if (admin?.role !== 'admin') {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    // Check if trying to delete an admin
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return next(new AppError('User not found', 404));
    }

    if (targetUser.role === 'admin') {
      return next(new AppError('Cannot delete admin users', 403));
    }

    // Delete user's blood requests
    await BloodRequest.deleteMany({ requester: targetUserId });

    // Delete user's notifications
    await Notification.deleteMany({ user: targetUserId });

    // Delete user's reports
    await (Report as unknown as ReportModel).deleteMany({ 
      $or: [
        { reportedUser: targetUserId },
        { reportedBy: targetUserId }
      ]
    });

    // Finally delete the user
    await User.findByIdAndDelete(targetUserId);

    res.status(200).json({
      success: true,
      message: 'User and all associated data deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    next(new AppError('Failed to delete user', 500));
  }
};
  