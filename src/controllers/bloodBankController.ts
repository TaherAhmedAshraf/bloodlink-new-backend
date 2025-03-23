import { Request, Response, NextFunction } from 'express';
import BloodBank from '../models/BloodBank';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

// Helper function to calculate distance between two coordinates
const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  return distance;
};

export const getBloodBanks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zone, district, page = 1, limit = 10, lat, lng } = req.query;
    
    // Build query
    const query: any = {};
    
    if (zone) {
      query.location = { $regex: zone, $options: 'i' };
    }
    
    if (district) {
      query.location = { ...query.location, $regex: district, $options: 'i' };
    }
    
    // Calculate pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count
    const total = await BloodBank.countDocuments(query);
    
    // Get blood banks
    const bloodBanks = await BloodBank.find(query)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    // Calculate distance if coordinates are provided
    let bloodBanksWithDistance: Array<any> = bloodBanks;
    
    if (lat && lng) {
      const userLat = parseFloat(lat as string);
      const userLng = parseFloat(lng as string);
      
      bloodBanksWithDistance = bloodBanks.map(bank => {
        const distance = calculateDistance(
          userLat,
          userLng,
          bank.coordinates.latitude,
          bank.coordinates.longitude
        );
        
        return {
          ...bank,
          distance: `${distance.toFixed(1)} km`
        };
      });
      
      // Sort by distance
      bloodBanksWithDistance.sort((a, b) => {
        const distA = parseFloat(a.distance);
        const distB = parseFloat(b.distance);
        return distA - distB;
      });
    }
    
    res.status(200).json({
      bloodBanks: bloodBanksWithDistance.map(bank => ({
        id: bank._id,
        name: bank.name,
        location: bank.location,
        distance: bank.distance || 'Unknown',
        rating: bank.rating,
        phone: bank.phone
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching blood banks', error);
    next(new AppError('Failed to fetch blood banks', 500));
  }
};

export const getBloodBankDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bankId } = req.params;
    const { lat, lng } = req.query;
    
    const bloodBank = await BloodBank.findById(bankId);
    
    if (!bloodBank) {
      return next(new AppError('Blood bank not found', 404));
    }
    
    let distance = 'Unknown';
    
    if (lat && lng) {
      const userLat = parseFloat(lat as string);
      const userLng = parseFloat(lng as string);
      
      const calculatedDistance = calculateDistance(
        userLat,
        userLng,
        bloodBank.coordinates.latitude,
        bloodBank.coordinates.longitude
      );
      
      distance = `${calculatedDistance.toFixed(1)} km`;
    }
    
    res.status(200).json({
      id: bloodBank._id,
      name: bloodBank.name,
      location: bloodBank.location,
      distance,
      rating: bloodBank.rating,
      phone: bloodBank.phone,
      hours: bloodBank.hours,
      bloodNeeded: bloodBank.bloodNeeded,
      coordinates: bloodBank.coordinates
    });
  } catch (error) {
    logger.error('Error fetching blood bank details', error);
    next(new AppError('Failed to fetch blood bank details', 500));
  }
}; 