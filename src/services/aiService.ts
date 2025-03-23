import { IMessage } from '../models/Conversation';
import logger from '../utils/logger';

// This is a simple mock AI service
// In a real application, you would integrate with an AI service like OpenAI
export const generateAIResponse = async (
  message: string, 
  conversationHistory: IMessage[]
): Promise<string> => {
  try {
    logger.info(`Generating AI response for: ${message}`);
    
    // Simple keyword-based responses
    if (message.toLowerCase().includes('donate blood')) {
      return "To donate blood, you should be at least 18 years old, weigh at least 50kg, and be in good health. You should wait at least 3 months between donations. Would you like me to help you find a nearby blood bank?";
    }
    
    if (message.toLowerCase().includes('blood type')) {
      return "There are 8 main blood types: A+, A-, B+, B-, AB+, AB-, O+, and O-. O- is the universal donor, and AB+ is the universal recipient. Would you like to know more about a specific blood type?";
    }
    
    if (message.toLowerCase().includes('hemoglobin')) {
      return "Hemoglobin is a protein in your red blood cells that carries oxygen. For blood donation, men typically need a hemoglobin level of at least 13.5 g/dL, and women need at least 12.5 g/dL.";
    }
    
    if (message.toLowerCase().includes('find donor') || message.toLowerCase().includes('need blood')) {
      return "I can help you create a blood request. You'll need to provide details like blood type needed, hospital name, location, and patient information. Would you like to create a blood request now?";
    }
    
    // Default response
    return "I understand you're interested in blood donation. How can I assist you today? I can help with information about blood types, donation eligibility, finding donors, or locating blood banks.";
  } catch (error) {
    logger.error('Error generating AI response', error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
  }
}; 