import mongoose from 'mongoose';
import BloodBank from '../models/BloodBank';
import logger from './logger';
import { MONGODB_URI } from '../config';

const seedBloodBanks = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    
    // Check if blood banks already exist
    const count = await BloodBank.countDocuments();
    
    if (count > 0) {
      logger.info('Blood banks already seeded');
      return;
    }
    
    // Sample blood banks data
    const bloodBanks = [
      {
        name: 'Lab Aid Blood Bank',
        location: 'Mirpur, Dhaka',
        phone: '+8801712345678',
        hours: 'Mon-Fri: 8AM-6PM, Sat: 9AM-3PM',
        bloodNeeded: 'A+ Blood Needed',
        rating: 4.5,
        coordinates: {
          latitude: 23.8103,
          longitude: 90.4125
        }
      },
      {
        name: 'Dhaka Blood Bank',
        location: 'Dhanmondi, Dhaka',
        phone: '+8801712345679',
        hours: 'Mon-Sat: 9AM-8PM',
        bloodNeeded: 'O- Blood Needed',
        rating: 4.2,
        coordinates: {
          latitude: 23.7461,
          longitude: 90.3742
        }
      },
      {
        name: 'Bangladesh Red Crescent Blood Bank',
        location: 'Mohammadpur, Dhaka',
        phone: '+8801712345680',
        hours: 'Mon-Fri: 9AM-5PM',
        bloodNeeded: 'All Blood Types Needed',
        rating: 4.7,
        coordinates: {
          latitude: 23.7669,
          longitude: 90.3669
        }
      },
      {
        name: 'Quantum Blood Bank',
        location: 'Uttara, Dhaka',
        phone: '+8801712345681',
        hours: 'Mon-Sun: 24 Hours',
        bloodNeeded: 'B+ Blood Needed',
        rating: 4.0,
        coordinates: {
          latitude: 23.8759,
          longitude: 90.3795
        }
      },
      {
        name: 'Sandhani Blood Bank',
        location: 'Shahbag, Dhaka',
        phone: '+8801712345682',
        hours: 'Mon-Sat: 8AM-10PM',
        bloodNeeded: 'AB+ Blood Needed',
        rating: 4.8,
        coordinates: {
          latitude: 23.7399,
          longitude: 90.3949
        }
      }
    ];
    
    // Insert blood banks
    await BloodBank.insertMany(bloodBanks);
    
    logger.info('Blood banks seeded successfully');
  } catch (error) {
    logger.error('Error seeding blood banks', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
  }
};

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedBloodBanks()
    .then(() => {
      logger.info('Seeding completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Seeding failed', error);
      process.exit(1);
    });
}

export default seedBloodBanks; 