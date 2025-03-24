import { Request, Response, NextFunction } from 'express';
import Conversation from '../models/Conversation';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { generateAIResponse } from '../services/aiService';
import mongoose from 'mongoose';

// Define a custom Request type that includes the user property
type AuthRequest = Request & { user?: { id: string } };

export const getChatHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Get all conversations for the user
    const conversations = await Conversation.find({ user: userId })
      .sort({ updatedAt: -1 })
      .lean();
    
    res.status(200).json({
      conversations: conversations.map(conv => ({
        id: conv._id,
        title: conv.title,
        messages: conv.messages.map(msg => ({
          // Use type assertion for the message object
          id: (msg as any)._id,
          text: msg.text,
          isUser: msg.isUser,
          timestamp: msg.timestamp
        }))
      }))
    });
  } catch (error) {
    logger.error('Error fetching chat history', error);
    next(new AppError('Failed to fetch chat history', 500));
  }
};

export const sendChatMessage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    const { text, conversationId } = req.body;
    console.log(req.body)
    
    if (!text) {
      return next(new AppError('Message text is required', 400));
    }
    
    let conversation;
    
    // If conversationId is provided, find existing conversation
    if (conversationId) {
      conversation = await Conversation.findOne({ 
        _id: conversationId,
        user: userId
      });
      
      if (!conversation) {
        return next(new AppError('Conversation not found', 404));
      }
    } else {
      // Create a new conversation
      conversation = new Conversation({
        title: text.length > 30 ? `${text.substring(0, 30)}...` : text,
        user: userId,
        messages: []
      });
    }
    
    // Add user message
    const userMessage = {
      text,
      isUser: true,
      timestamp: new Date()
    };
    
    conversation.messages.push(userMessage);
    
    // Generate AI response - pass userId to the function
    const aiResponseText = await generateAIResponse(text, conversation.messages, userId);
    
    // Add AI response
    const aiMessage = {
      text: aiResponseText,
      isUser: false,
      timestamp: new Date()
    };
    
    conversation.messages.push(aiMessage);
    
    // Save conversation
    await conversation.save();
    
    // Get the IDs of the newly added messages
    const userMessageId = (conversation.messages[conversation.messages.length - 2] as any)._id;
    const aiMessageId = (conversation.messages[conversation.messages.length - 1] as any)._id;
    
    res.status(200).json({
      success: true,
      message: {
        id: userMessageId,
        text,
        isUser: true,
        timestamp: userMessage.timestamp
      },
      response: {
        id: aiMessageId,
        text: aiResponseText,
        isUser: false,
        timestamp: aiMessage.timestamp
      },
      conversationId:conversation.id
    });
  } catch (error) {
    logger.error('Error sending chat message', error);
    next(new AppError('Failed to send chat message', 500));
  }
};

export const getConversation = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    
    if (!userId) {
      return next(new AppError('User ID not found in request', 401));
    }
    
    // Get conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      user: userId
    }).lean();
    
    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }
    
    res.status(200).json({
      id: conversation._id,
      title: conversation.title,
      messages: conversation.messages.map(msg => ({
        id: (msg as any)._id,
        text: msg.text,
        isUser: msg.isUser,
        timestamp: msg.timestamp
      }))
    });
  } catch (error) {
    logger.error('Error fetching conversation', error);
    next(new AppError('Failed to fetch conversation', 500));
  }
}; 