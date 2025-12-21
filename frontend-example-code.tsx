/**
 * Frontend Example Code - Real-Time Chat List Updates
 * 
 * Copy and adapt these examples for your frontend implementation
 */

// ============================================
// 1. Socket Service (socket.service.ts)
// ============================================

import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io('http://localhost:5000', {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();

// ============================================
// 2. Chat List Hook (useChatList.ts)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import socketService from './socket.service';

interface Chat {
  _id: string;
  EnquiryId: string;
  EnquiryName: string;
  LastMessage: {
    Text: string;
    Timestamp: string;
  };
  UnreadCount: number;
  UpdatedAt: string;
}

interface MessageData {
  ChatId: string;
  EnquiryId: string;
  SenderId: string;
  Message: string;
  MessageType: string;
  Timestamp: string;
}

interface MessagesReadData {
  chatId: string;
  userId: string;
  unreadCount: number;
}

export function useChatList() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChats = useCallback(async () => {
    try {
      // Your existing API call
      const response = await fetch('/api/chats');
      const data = await response.json();
      setChats(data.Data || []);
    } catch (err) {
      console.error('Error loading chats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    // Handle new message
    const handleNewMessage = (messageData: MessageData) => {
      setChats((prevChats) => {
        const chatIndex = prevChats.findIndex(
          (c) => c._id === messageData.ChatId || c.EnquiryId === messageData.EnquiryId
        );

        if (chatIndex === -1) {
          loadChats(); // Refresh if chat not found
          return prevChats;
        }

        const updated = [...prevChats];
        const chat = updated[chatIndex];
        const currentUserId = getCurrentUserId(); // Get from auth
        const isFromCurrentUser = messageData.SenderId === currentUserId;

        const messageText = 
          messageData.MessageType === 'text' ? messageData.Message :
          messageData.MessageType === 'image' ? '📷 Photo' :
          messageData.MessageType === 'video' ? '🎥 Video' : '📎 Attachment';

        updated[chatIndex] = {
          ...chat,
          LastMessage: {
            Text: messageText,
            Timestamp: messageData.Timestamp
          },
          UnreadCount: isFromCurrentUser ? chat.UnreadCount : chat.UnreadCount + 1,
          UpdatedAt: messageData.Timestamp
        };

        // Sort by most recent
        return updated.sort((a, b) => 
          new Date(b.UpdatedAt).getTime() - new Date(a.UpdatedAt).getTime()
        );
      });
    };

    // Handle messages read
    const handleMessagesRead = (data: MessagesReadData) => {
      setChats((prevChats) => {
        const index = prevChats.findIndex((c) => c._id === data.chatId);
        if (index === -1) return prevChats;

        const updated = [...prevChats];
        updated[index].UnreadCount = data.unreadCount;
        return updated;
      });
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('messagesRead', handleMessagesRead);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('messagesRead', handleMessagesRead);
    };
  }, [loadChats]);

  // Optional: Keep polling as 30s backup
  useEffect(() => {
    const interval = setInterval(loadChats, 30000);
    return () => clearInterval(interval);
  }, [loadChats]);

  return { chats, loading, refreshChats: loadChats };
}

function getCurrentUserId(): string {
  // Get from your auth context/store
  return localStorage.getItem('userId') || '';
}

// ============================================
// 3. Chat List Component (ChatList.tsx)
// ============================================

import React, { useEffect } from 'react';
import { useChatList } from './hooks/useChatList';
import socketService from './services/socket.service';

function ChatList() {
  const { chats, loading, refreshChats } = useChatList();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socketService.connect(token);
    }
    return () => socketService.disconnect();
  }, []);

  const handleChatClick = (chatId: string) => {
    // Mark as read when opening chat
    const socket = socketService.getSocket();
    socket?.emit('markMessagesRead', { chatId });
    // Navigate to chat...
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="chat-list">
      {chats.map((chat) => (
        <div
          key={chat._id}
          className={`chat-item ${chat.UnreadCount > 0 ? 'unread' : ''}`}
          onClick={() => handleChatClick(chat._id)}
        >
          <h3>{chat.EnquiryName}</h3>
          <p>{chat.LastMessage.Text}</p>
          {chat.UnreadCount > 0 && (
            <span className="badge">{chat.UnreadCount}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default ChatList;

// ============================================
// 4. Mark Messages as Read Utility
// ============================================

import socketService from './services/socket.service';

export function markMessagesAsRead(chatId: string, messageIds?: string[]) {
  const socket = socketService.getSocket();
  if (!socket?.connected) {
    console.warn('Socket not connected');
    return;
  }

  socket.emit('markMessagesRead', {
    chatId,
    messageIds: messageIds || []
  });
}

// ============================================
// 5. App Initialization (App.tsx)
// ============================================

import { useEffect } from 'react';
import socketService from './services/socket.service';

function App() {
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socketService.connect(token);
    }

    return () => {
      socketService.disconnect();
    };
  }, []);

  return (
    <div>
      {/* Your app */}
    </div>
  );
}

export default App;

