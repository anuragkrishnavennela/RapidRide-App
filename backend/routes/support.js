const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Firebase Auth middleware
const User = require('../models/user');

// Firebase Auth middleware with DB User Fetch
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    // 1. Verify Firebase Token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // 2. Fetch User from DB (to get role)
    const user = await User.findOne({
      $or: [{ firebaseUid: decodedToken.uid }, { email: decodedToken.email }]
    });

    if (user) {
      req.user = { ...decodedToken, ...user.toObject(), id: user._id.toString() };
    } else {
      req.user = decodedToken; // Fallback (role will be missing)
    }

    req.firebaseUser = decodedToken;
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// In-memory storage for chats (replace with MongoDB in production)
const supportChats = new Map();
let chatCounter = 1000;

// Helper to generate ticket number
function generateTicketNumber() {
  return `TKT${String(chatCounter++).padStart(6, '0')}`;
}

// Helper to clean old chats (30 days)
function cleanOldChats() {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  for (const [chatId, chat] of supportChats.entries()) {
    if (new Date(chat.createdAt).getTime() < thirtyDaysAgo) {
      supportChats.delete(chatId);
    }
  }
}

// Run cleanup daily
setInterval(cleanOldChats, 24 * 60 * 60 * 1000);

// Create a new support chat
router.post('/chats/create', authMiddleware, (req, res) => {
  try {
    const { message, userType } = req.body; // userType: 'rider' or 'captain'

    const chatId = Date.now().toString();
    const ticketNumber = generateTicketNumber();

    const newChat = {
      chatId,
      ticketNumber,
      userId: req.user.uid || req.user.id,
      userType: userType || req.user.role || 'rider',
      userName: req.user.name || 'User',
      status: 'active', // active, ended
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          messageId: `${chatId}_1`,
          senderId: req.user.uid || req.user.id,
          senderType: userType || req.user.role || 'rider',
          text: message,
          timestamp: new Date().toISOString(),
          read: false
        }
      ]
    };

    supportChats.set(chatId, newChat);

    res.json({
      success: true,
      chat: {
        chatId: newChat.chatId,
        ticketNumber: newChat.ticketNumber,
        status: newChat.status,
        createdAt: newChat.createdAt
      }
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ message: 'Failed to create chat' });
  }
});

// Get all chats for a user (last 30 days)
router.get('/chats', authMiddleware, (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;

    const userChats = Array.from(supportChats.values())
      .filter(chat => chat.userId === userId)
      .map(chat => ({
        chatId: chat.chatId,
        ticketNumber: chat.ticketNumber,
        status: chat.status,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        lastMessage: chat.messages[chat.messages.length - 1]?.text || '',
        unreadCount: chat.messages.filter(m => !m.read && m.senderType === 'admin').length
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({ success: true, chats: userChats });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ message: 'Failed to fetch chats' });
  }
});

// Get chat details with all messages
router.get('/chats/:chatId', authMiddleware, (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.uid || req.user.id;

    const chat = supportChats.get(chatId);

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Verify user owns this chat or is admin
    if (chat.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Mark messages as read
    chat.messages.forEach(msg => {
      if (msg.senderType === 'admin') {
        msg.read = true;
      }
    });

    res.json({ success: true, chat });
  } catch (error) {
    console.error('Get chat details error:', error);
    res.status(500).json({ message: 'Failed to fetch chat details' });
  }
});

// Send a message in a chat
router.post('/chats/:chatId/messages', authMiddleware, (req, res) => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const userId = req.user.uid || req.user.id;

    const chat = supportChats.get(chatId);

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if chat is ended
    if (chat.status === 'ended') {
      return res.status(400).json({ message: 'Cannot send messages to ended chats' });
    }

    // Verify user owns this chat or is admin
    const isAdmin = req.user.role === 'admin';
    if (chat.userId !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const newMessage = {
      messageId: `${chatId}_${chat.messages.length + 1}`,
      senderId: userId,
      senderType: isAdmin ? 'admin' : chat.userType,
      text: message,
      timestamp: new Date().toISOString(),
      read: false
    };

    chat.messages.push(newMessage);
    chat.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// End a chat
router.post('/chats/:chatId/end', authMiddleware, (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.uid || req.user.id;

    const chat = supportChats.get(chatId);

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Verify user owns this chat or is admin
    if (chat.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    chat.status = 'ended';
    chat.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: 'Chat ended successfully'
    });
  } catch (error) {
    console.error('End chat error:', error);
    res.status(500).json({ message: 'Failed to end chat' });
  }
});

// Admin: Get all chats
router.get('/admin/chats', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { status, userType } = req.query;

    let chats = Array.from(supportChats.values());

    // Filter by status
    if (status) {
      chats = chats.filter(chat => chat.status === status);
    }

    // Filter by userType
    if (userType) {
      chats = chats.filter(chat => chat.userType === userType);
    }

    const formattedChats = chats
      .map(chat => ({
        chatId: chat.chatId,
        ticketNumber: chat.ticketNumber,
        userId: chat.userId,
        userName: chat.userName,
        userType: chat.userType,
        status: chat.status,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        lastMessage: chat.messages[chat.messages.length - 1]?.text || '',
        messageCount: chat.messages.length
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({ success: true, chats: formattedChats });
  } catch (error) {
    console.error('Admin get chats error:', error);
    res.status(500).json({ message: 'Failed to fetch chats' });
  }
});

module.exports = router;
