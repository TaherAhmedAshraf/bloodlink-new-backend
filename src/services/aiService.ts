import { IMessage } from '../models/Conversation';
import logger from '../utils/logger';
import axios from 'axios';
import BloodRequest from '../models/BloodRequest';
import mongoose from 'mongoose';
import { OPENAI_API_KEY } from '../config';

// OpenAI API configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Track ongoing blood request creation sessions
interface BloodRequestSession {
  stage: 'initial' | 'bloodType' | 'hospital' | 'location' | 'zone' | 'patientProblem' | 
         'bagNeeded' | 'date' | 'time' | 'hemoglobinPoint' | 'additionalInfo' | 'confirmation';
  bloodType?: string;
  hospital?: string;
  location?: string;
  zone?: string;
  patientProblem?: string;
  bagNeeded?: string;
  date?: string;
  time?: string;
  hemoglobinPoint?: string;
  additionalInfo?: string;
  lastUpdated: Date;
}

// Store user sessions (in a real app, this would be in a database)
const userSessions: Record<string, BloodRequestSession> = {};

// Function to generate AI response using OpenAI
export const generateAIResponse = async (
  message: string, 
  conversationHistory: IMessage[],
  userId?: string
): Promise<string> => {
  try {
    logger.info(`Generating AI response for: ${message}`);
    
    // Check if user has an active blood request session
    if (userId && userSessions[userId]) {
      const session = userSessions[userId];
      
      // Check if session is expired (30 minutes)
      const now = new Date();
      const sessionAge = now.getTime() - session.lastUpdated.getTime();
      if (sessionAge > 30 * 60 * 1000) {
        // Session expired, delete it
        delete userSessions[userId];
      } else {
        // Process the ongoing blood request session
        return await processBloodRequestSession(message, session, userId);
      }
    }
    
    // Check if this is a new blood request creation attempt - use more specific detection
    const bloodRequestKeywords = [
      'create blood request',
      'need blood donation', 
      'request blood donation',
      'looking for blood donor',
      'need blood urgently',
      'blood donation request'
    ];
    
    // Only trigger blood request flow if there's a clear intent
    const isBloodRequestIntent = bloodRequestKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // If there's a clear blood request intent
    if (isBloodRequestIntent && userId) {
      userSessions[userId] = {
        stage: 'initial',
        lastUpdated: new Date()
      };
      
      return "I'd be happy to help you create a blood request. Let's go through the process step by step:\n\n1. What blood type do you need? (A+, A-, B+, B-, AB+, AB-, O+, O-)";
    }
    
    // Format conversation history for OpenAI
    const formattedHistory = conversationHistory.map(msg => ({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    }));
    
    // Add system message for context
    const systemMessage = {
      role: 'system',
      content: `You are a helpful assistant for a blood donation app called BloodLink. 
      You help users find blood donors, create blood requests, and provide information about blood donation.
      Be concise, friendly, and helpful. If users want to create a blood request, guide them to say "create blood request" clearly.`
    };
    
    // Prepare messages for OpenAI
    const messages = [
      systemMessage,
      ...formattedHistory,
      { role: 'user', content: message }
    ];
    
    // Call OpenAI API
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Extract and return AI response
    const aiResponse = response.data.choices[0].message.content;
    return aiResponse;
  } catch (error) {
    logger.error('Error generating AI response', error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
  }
};

// Process blood request session
const processBloodRequestSession = async (
  message: string,
  session: BloodRequestSession,
  userId: string
): Promise<string> => {
  // Update session timestamp
  session.lastUpdated = new Date();
  
  // Extract any specific information from the message that might be useful later
  const extractedInfo = extractAdditionalInfo(message);
  if (extractedInfo.bloodType && !session.bloodType) session.bloodType = extractedInfo.bloodType;
  if (extractedInfo.hospital && !session.hospital) session.hospital = extractedInfo.hospital;
  if (extractedInfo.location && !session.location) session.location = extractedInfo.location;
  if (extractedInfo.zone && !session.zone) session.zone = extractedInfo.zone;
  if (extractedInfo.patientProblem && !session.patientProblem) session.patientProblem = extractedInfo.patientProblem;
  if (extractedInfo.bagNeeded && !session.bagNeeded) session.bagNeeded = extractedInfo.bagNeeded;
  
  // Process based on current stage
  switch (session.stage) {
    case 'initial':
      // Extract blood type from message
      const bloodType = extractBloodType(message);
      if (bloodType) {
        session.bloodType = bloodType;
        session.stage = 'hospital';
        return `Great! You need ${bloodType} blood. Now, please tell me the name of the hospital where the blood is needed.`;
      } else {
        return "I need to know what blood type you're looking for. Please specify one of the following: A+, A-, B+, B-, AB+, AB-, O+, or O-.";
      }
      
    case 'bloodType':
      // Extract blood type from message
      const bloodTypeResponse = extractBloodType(message);
      if (bloodTypeResponse) {
        session.bloodType = bloodTypeResponse;
        session.stage = 'hospital';
        return `Thank you! You need ${bloodTypeResponse} blood. Now, please tell me the name of the hospital where the blood is needed.`;
      } else {
        return "I still need to know what blood type you're looking for. Please specify one of the following: A+, A-, B+, B-, AB+, AB-, O+, or O-.";
      }
      
    case 'hospital':
      // Extract hospital from message
      if (message.length > 3) {
        session.hospital = message.trim();
        session.stage = 'location';
        return `Got it! The hospital is ${session.hospital}. Now, please provide the location/address of the hospital.`;
      } else {
        return "Please provide the name of the hospital where the blood is needed.";
      }
      
    case 'location':
      // Extract location from message
      if (message.length > 3) {
        session.location = message.trim();
        session.stage = 'zone';
        return `Thank you! The location is ${session.location}. What zone or area is this in? (e.g., Dhanmondi, Gulshan, Mirpur)`;
      } else {
        return "Please provide the location or address of the hospital.";
      }
      
    case 'zone':
      // Extract zone from message
      if (message.length > 2) {
        session.zone = message.trim();
        session.stage = 'patientProblem';
        return `Got it! The zone is ${session.zone}. What is the patient's medical condition or reason for needing blood?`;
      } else {
        return "Please provide the zone or area where the hospital is located.";
      }
      
    case 'patientProblem':
      // Extract patient problem from message
      if (message.length > 3) {
        session.patientProblem = message.trim();
        session.stage = 'bagNeeded';
        return `I understand the patient's condition is: ${session.patientProblem}. How many bags of blood are needed?`;
      } else {
        return "Please provide information about the patient's condition or reason for needing blood.";
      }
      
    case 'bagNeeded':
      // Try to extract a number
      const bagMatch = message.match(/(\d+)/);
      if (bagMatch) {
        const bagValue = bagMatch[1];
        
        // Validate the number of bags
        if (validateBloodBags(bagValue)) {
          session.bagNeeded = bagValue;
          session.stage = 'date';
          return "Got it. When is the blood needed? Please provide a date in DD/MM/YYYY format, or say 'today' or 'tomorrow'.";
        } else {
          return "The number of blood bags you requested seems unusual. Typically, requests are for 1-10 bags. Please provide a valid number of bags needed.";
        }
      } else {
        return "I couldn't understand how many bags are needed. Please provide a number (e.g., 2 bags).";
      }
      
    case 'date':
      const dateValue = extractDate(message);
      if (dateValue) {
        // Validate the date
        if (validateDate(dateValue)) {
          session.date = dateValue;
          session.stage = 'time';
          return "Thank you. What time is the blood needed? Please provide a time in HH:MM format (e.g., 14:30) or H:MM AM/PM format (e.g., 2:30 PM).";
        } else {
          return "The date you provided is either in the past or too far in the future. Please provide a date that is today or within the next 30 days.";
        }
      } else {
        return "I couldn't understand the date. Please provide a date in DD/MM/YYYY format, or say 'today' or 'tomorrow'.";
      }
      
    case 'time':
      if (validateTime(message)) {
        session.time = message;
        session.stage = 'hemoglobinPoint';
        return "Thank you. If you know, what is the patient's hemoglobin level? (Type 'skip' if you don't know)";
      } else {
        return "I couldn't understand the time format. Please provide a time in HH:MM format (e.g., 14:30) or H:MM AM/PM format (e.g., 2:30 PM).";
      }
      
    case 'hemoglobinPoint':
      if (message.toLowerCase() === 'skip' || message.toLowerCase() === 'unknown') {
        session.hemoglobinPoint = 'Not specified';
        session.stage = 'additionalInfo';
        return "That's fine. Do you have any additional information about the patient or the request? (Type 'skip' if none)";
      }
      
      // Try to extract a number
      const hemoglobinMatch = message.match(/(\d+(\.\d+)?)/);
      if (hemoglobinMatch) {
        const hemoglobinValue = hemoglobinMatch[1];
        
        // Validate the hemoglobin level
        if (validateHemoglobin(hemoglobinValue)) {
          session.hemoglobinPoint = hemoglobinValue;
          session.stage = 'additionalInfo';
          return "Thank you. Do you have any additional information about the patient or the request? (Type 'skip' if none)";
        } else {
          return "The hemoglobin level you provided seems unusual. Normal hemoglobin levels are typically between 7-20 g/dL. Please provide a valid hemoglobin level or type 'skip' if you don't know.";
        }
      } else {
        return "I couldn't understand the hemoglobin level. Please provide a number (e.g., 12.5) or type 'skip' if you don't know.";
      }
      
    case 'additionalInfo':
      // Extract additional info or skip
      if (message.toLowerCase().includes('skip')) {
        session.additionalInfo = "";
      } else {
        session.additionalInfo = message.trim();
      }
      
      session.stage = 'confirmation';
      
      // Prepare confirmation message
      let confirmationMessage = `Thank you for providing all the details. Please confirm the following information:\n\n`;
      confirmationMessage += `Blood Type: ${session.bloodType}\n`;
      confirmationMessage += `Hospital: ${session.hospital}\n`;
      confirmationMessage += `Location: ${session.location}\n`;
      confirmationMessage += `Zone: ${session.zone}\n`;
      confirmationMessage += `Patient's Condition: ${session.patientProblem}\n`;
      confirmationMessage += `Bags Needed: ${session.bagNeeded}\n`;
      confirmationMessage += `Date: ${session.date}\n`;
      confirmationMessage += `Time: ${session.time}\n`;
      
      if (session.hemoglobinPoint && session.hemoglobinPoint !== "Not specified") {
        confirmationMessage += `Hemoglobin Level: ${session.hemoglobinPoint}\n`;
      }
      
      if (session.additionalInfo && session.additionalInfo.length > 0) {
        confirmationMessage += `Additional Info: ${session.additionalInfo}\n`;
      }
      
      confirmationMessage += `\nIs this information correct? (Yes/No)`;
      
      return confirmationMessage;
      
    case 'confirmation':
      // Check if user confirms
      if (message.toLowerCase().includes('yes') || message.toLowerCase().includes('correct') || message.toLowerCase().includes('right')) {
        // Create blood request
        try {
          // Check if all required fields are present
          if (!session.bloodType || !session.hospital || !session.location || 
              !session.zone || !session.patientProblem || !session.bagNeeded || 
              !session.date || !session.time) {
            session.stage = 'initial';
            return "I'm missing some required information. Let's start over. What blood type do you need?";
          }
          
          // Additional validation before creating the request
          if (!validateBloodBags(session.bagNeeded)) {
            session.bagNeeded = "1"; // Default to 1 bag if invalid
          }
          
          if (session.hemoglobinPoint && session.hemoglobinPoint !== 'Not specified' && 
              !validateHemoglobin(session.hemoglobinPoint)) {
            session.hemoglobinPoint = "Not specified"; // Default if invalid
          }
          
          if (!validateDate(session.date)) {
            // Set to today if invalid
            const today = new Date();
            const day = today.getDate().toString().padStart(2, '0');
            const month = (today.getMonth() + 1).toString().padStart(2, '0');
            const year = today.getFullYear();
            session.date = `${day}/${month}/${year}`;
          }
          
          const bloodRequest = await BloodRequest.create({
            bloodType: session.bloodType,
            hospital: session.hospital,
            location: session.location,
            hemoglobinPoint: session.hemoglobinPoint || "Not specified",
            patientProblem: session.patientProblem,
            bagNeeded: session.bagNeeded,
            zone: session.zone,
            date: session.date,
            time: session.time,
            additionalInfo: session.additionalInfo || "",
            requester: new mongoose.Types.ObjectId(userId),
            status: 'active',
            viewCount: 0
          });
          
          // Clear session
          delete userSessions[userId];
          
          return `✅ Success! I've created a blood request for you with the following details:
          
Blood Type: ${session.bloodType}
Hospital: ${session.hospital}
Location: ${session.location}
Zone: ${session.zone}
Patient's Condition: ${session.patientProblem}
Bags Needed: ${session.bagNeeded}
Date: ${session.date}
Time: ${session.time}
${session.hemoglobinPoint && session.hemoglobinPoint !== 'Not specified' ? `Hemoglobin Level: ${session.hemoglobinPoint} g/dL\n` : ''}
${session.additionalInfo ? `Additional Info: ${session.additionalInfo}\n` : ''}
Request ID: ${bloodRequest._id}

Your request is now active and potential donors can see it. You can check the status of your request in the "My Requests" section. Is there anything else you need help with?`;
        } catch (error) {
          logger.error('Error creating blood request via AI', error);
          delete userSessions[userId];
          return "I'm sorry, I couldn't create your blood request due to a technical issue. Please try using the 'Create Request' feature directly from the app menu.";
        }
      } else if (message.toLowerCase().includes('no') || message.toLowerCase().includes('wrong') || message.toLowerCase().includes('incorrect')) {
        // Start over
        session.stage = 'initial';
        session.bloodType = undefined;
        session.hospital = undefined;
        session.location = undefined;
        session.zone = undefined;
        session.patientProblem = undefined;
        session.bagNeeded = undefined;
        session.date = undefined;
        session.time = undefined;
        session.hemoglobinPoint = undefined;
        session.additionalInfo = undefined;
        return "I'm sorry about that. Let's start over. What blood type do you need? (A+, A-, B+, B-, AB+, AB-, O+, O-)";
      } else {
        return "Please confirm if the information is correct by saying 'Yes' or 'No'.";
      }
  }
};

// Extract blood type from message
const extractBloodType = (message: string): string | null => {
  const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  
  // Check for exact matches
  for (const type of bloodTypes) {
    if (message.includes(type)) {
      return type;
    }
  }
  
  // Check for variations
  const normalizedMessage = message.toUpperCase();
  if (normalizedMessage.includes('A POSITIVE') || normalizedMessage.includes('A +VE')) return 'A+';
  if (normalizedMessage.includes('A NEGATIVE') || normalizedMessage.includes('A -VE')) return 'A-';
  if (normalizedMessage.includes('B POSITIVE') || normalizedMessage.includes('B +VE')) return 'B+';
  if (normalizedMessage.includes('B NEGATIVE') || normalizedMessage.includes('B -VE')) return 'B-';
  if (normalizedMessage.includes('AB POSITIVE') || normalizedMessage.includes('AB +VE')) return 'AB+';
  if (normalizedMessage.includes('AB NEGATIVE') || normalizedMessage.includes('AB -VE')) return 'AB-';
  if (normalizedMessage.includes('O POSITIVE') || normalizedMessage.includes('O +VE')) return 'O+';
  if (normalizedMessage.includes('O NEGATIVE') || normalizedMessage.includes('O -VE')) return 'O-';
  
  return null;
};

// Extract date from message
const extractDate = (message: string): string | null => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const formatDate = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };
  
  // Check for common date phrases
  if (message.toLowerCase().includes('today')) {
    return formatDate(today);
  }
  
  if (message.toLowerCase().includes('tomorrow')) {
    return formatDate(tomorrow);
  }
  
  // Check for DD/MM/YYYY format
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
  const match = message.match(dateRegex);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${day}/${month}/${year}`;
  }
  
  return null;
};

// Extract additional information from message
const extractAdditionalInfo = (message: string): any => {
  const info: any = {};
  
  // Extract blood type
  info.bloodType = extractBloodType(message);
  
  // Extract hospital name
  const hospitalMatch = message.match(/(?:at|in|for)\s+([A-Za-z\s]+(?:Hospital|Medical|Clinic))/i);
  if (hospitalMatch) {
    info.hospital = hospitalMatch[1].trim();
  }
  
  // Extract location
  const locationMatch = message.match(/(?:in|at)\s+([A-Za-z\s,]+?)(?:\.|\,|for|blood|\s+need|\s+hospital|$)/i);
  if (locationMatch) {
    info.location = locationMatch[1].trim();
  }
  
  // Extract zone
  const zoneKeywords = ['zone', 'area', 'district'];
  for (const keyword of zoneKeywords) {
    const zoneMatch = message.match(new RegExp(`${keyword}\\s+([A-Za-z\\s]+?)(?:\\.|\,|\\s+|$)`, 'i'));
    if (zoneMatch) {
      info.zone = zoneMatch[1].trim();
      break;
    }
  }
  
  // Extract patient problem
  const problemKeywords = ['problem', 'condition', 'diagnosis', 'patient has', 'suffering from'];
  for (const keyword of problemKeywords) {
    const problemMatch = message.match(new RegExp(`${keyword}\\s+([A-Za-z\\s]+?)(?:\\.|\,|\\s+|$)`, 'i'));
    if (problemMatch) {
      info.patientProblem = problemMatch[1].trim();
      break;
    }
  }
  
  // Extract bags needed
  const bagMatch = message.match(/(\d+)\s+(?:bag|bags|unit|units)/i);
  if (bagMatch) {
    info.bagNeeded = bagMatch[1];
  }
  
  return info;
};

// Add these validation functions to the aiService.ts file

// Validate hemoglobin level
const validateHemoglobin = (level: string): boolean => {
  // Convert to number
  const hemoglobin = parseFloat(level);
  
  // Check if it's a valid number
  if (isNaN(hemoglobin)) return false;
  
  // Typical hemoglobin range is 7-20 g/dL
  // Below 7 is severe anemia, above 20 is extremely rare
  return hemoglobin >= 7 && hemoglobin <= 20;
};

// Validate blood bags needed
const validateBloodBags = (bags: string): boolean => {
  // Convert to number
  const numBags = parseInt(bags);
  
  // Check if it's a valid number
  if (isNaN(numBags)) return false;
  
  // Typical transfusion is 1-10 bags
  // More than 10 would be extremely unusual for a single request
  return numBags >= 1 && numBags <= 10;
};

// Validate date (must be today or in the future, not more than 30 days ahead)
const validateDate = (dateStr: string): boolean => {
  // Parse date (assuming DD/MM/YYYY format)
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
  const year = parseInt(parts[2]);
  
  const inputDate = new Date(year, month, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day
  
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(today.getDate() + 30);
  
  // Check if date is valid, not in the past, and not more than 30 days in the future
  return !isNaN(inputDate.getTime()) && 
         inputDate >= today && 
         inputDate <= thirtyDaysLater;
};

// Validate time format (HH:MM or H:MM AM/PM)
const validateTime = (timeStr: string): boolean => {
  // Check 24-hour format (HH:MM)
  const militaryTimeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (militaryTimeRegex.test(timeStr)) return true;
  
  // Check 12-hour format (H:MM AM/PM)
  const twelveHourRegex = /^(1[0-2]|0?[1-9]):([0-5][0-9])\s?(AM|PM|am|pm)$/;
  return twelveHourRegex.test(timeStr);
}; 