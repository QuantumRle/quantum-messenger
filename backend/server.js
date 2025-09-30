const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Хранилище данных
let users = [];
let messages = [];
let friendships = [];
let groups = [];
let notifications = [];

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Автоматический вход/регистрация
  socket.on('login', (userData) => {
    let user = users.find(u => u.username.toLowerCase() === userData.username.toLowerCase());
    
    if (!user) {
      user = {
        id: Date.now() + Math.random(),
        username: userData.username,
        email: userData.email || '',
        isOnline: true,
        lastSeen: new Date(),
        socketId: socket.id,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username)}&background=667eea&color=fff&bold=true`,
        status: 'online',
        language: 'ru',
        timezone: 'Europe/Moscow',
        bio: '',
        createdAt: new Date(),
        lastActive: new Date()
      };
      users.push(user);
    } else {
      user.isOnline = true;
      user.socketId = socket.id;
      user.lastSeen = new Date();
      user.status = 'online';
      user.lastActive = new Date();
    }

    socket.userId = user.id;
    socket.emit('loginSuccess', user);
    
    // Отправляем историю сообщений
    const userMessages = messages.filter(m => 
      m.senderId === user.id || 
      m.receiverId === user.id || 
      (m.groupId && groups.find(g => g.members.includes(user.id)))
    );
    socket.emit('messageHistory', userMessages);
    
    // Отправляем список пользователей
    socket.emit('usersList', users);
    
    // Отправляем друзей
    const userFriends = getFriends(user.id);
    socket.emit('friendsList', userFriends);
    
    // Отправляем группы пользователя
    const userGroups = groups.filter(g => g.members.includes(user.id));
    socket.emit('groupsList', userGroups);
    
    // Уведомляем всех о новом онлайн пользователе
    io.emit('userStatusUpdate', user);
    
    console.log('🔓 User logged in:', user.username);
  });

  // Обновление профиля
  socket.on('updateProfile', (profileData) => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      if (profileData.username) user.username = profileData.username;
      if (profileData.email) user.email = profileData.email;
      if (profileData.bio) user.bio = profileData.bio;
      if (profileData.language) user.language = profileData.language;
      if (profileData.timezone) user.timezone = profileData.timezone;
      if (profileData.avatar) user.avatar = profileData.avatar;
      
      io.emit('userProfileUpdated', user);
      socket.emit('profileUpdateSuccess', user);
      console.log('📝 Profile updated:', user.username);
    }
  });

  // Поиск пользователей
  socket.on('searchUsers', (searchTerm) => {
    const currentUser = users.find(u => u.socketId === socket.id);
    if (!currentUser) return;

    const results = users.filter(user => 
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) &&
      user.id !== currentUser.id
    ).map(user => ({
      ...user,
      isFriend: isFriend(currentUser.id, user.id),
      hasPendingRequest: hasPendingRequest(currentUser.id, user.id)
    }));
    
    socket.emit('searchResults', results);
  });

  // Добавление в друзья
  socket.on('addFriend', (friendId) => {
    const currentUser = users.find(u => u.socketId === socket.id);
    if (!currentUser) return;

    // Проверяем нет ли уже заявки
    const existingFriendship = friendships.find(f => 
      (f.userId === currentUser.id && f.friendId === friendId) ||
      (f.friendId === currentUser.id && f.userId === friendId)
    );

    if (!existingFriendship) {
      const friendship = {
        id: Date.now() + Math.random(),
        userId: currentUser.id,
        friendId: friendId,
        status: 'pending',
        createdAt: new Date()
      };
      friendships.push(friendship);
      
      // Уведомление другу
      const friend = users.find(u => u.id === friendId);
      if (friend && friend.socketId) {
        const notification = {
          id: Date.now() + Math.random(),
          type: 'friend_request',
          from: currentUser,
          to: friendId,
          message: `${currentUser.username} отправил вам запрос в друзья`,
          timestamp: new Date(),
          read: false
        };
        notifications.push(notification);
        
        io.to(friend.socketId).emit('newNotification', notification);
        io.to(friend.socketId).emit('friendRequest', {
          from: currentUser,
          friendship: friendship
        });
      }
      
      socket.emit('friendRequestSent', friend);
    }
  });

  // Принятие заявки в друзья
  socket.on('acceptFriend', (friendshipId) => {
    const friendship = friendships.find(f => f.id === friendshipId);
    if (friendship) {
      friendship.status = 'accepted';
      
      const user = users.find(u => u.id === friendship.userId);
      const friend = users.find(u => u.id === friendship.friendId);
      
      // Уведомление обоим пользователям
      if (user && user.socketId) {
        io.to(user.socketId).emit('friendAccepted', friend);
        io.to(user.socketId).emit('newNotification', {
          id: Date.now() + Math.random(),
          type: 'friend_accepted',
          from: friend,
          to: user.id,
          message: `${friend.username} принял вашу заявку в друзья`,
          timestamp: new Date(),
          read: false
        });
      }
      if (friend && friend.socketId) {
        io.to(friend.socketId).emit('friendAccepted', user);
      }
      
      // Обновляем списки друзей
      io.to(user.socketId).emit('friendsList', getFriends(user.id));
      io.to(friend.socketId).emit('friendsList', getFriends(friend.id));
    }
  });

  // Отклонение заявки в друзья
  socket.on('rejectFriend', (friendshipId) => {
    const friendship = friendships.find(f => f.id === friendshipId);
    if (friendship) {
      friendships = friendships.filter(f => f.id !== friendshipId);
      
      const user = users.find(u => u.id === friendship.userId);
      if (user && user.socketId) {
        io.to(user.socketId).emit('friendRequestRejected', {
          friendshipId: friendshipId
        });
      }
    }
  });

  // Удаление из друзей
  socket.on('removeFriend', (friendId) => {
    const currentUser = users.find(u => u.socketId === socket.id);
    if (!currentUser) return;

    friendships = friendships.filter(f => 
      !((f.userId === currentUser.id && f.friendId === friendId) ||
        (f.friendId === currentUser.id && f.userId === friendId))
    );
    
    socket.emit('friendRemoved', friendId);
    
    // Уведомляем другого пользователя
    const friend = users.find(u => u.id === friendId);
    if (friend && friend.socketId) {
      io.to(friend.socketId).emit('friendRemoved', currentUser.id);
      io.to(friend.socketId).emit('friendsList', getFriends(friend.id));
    }
    
    socket.emit('friendsList', getFriends(currentUser.id));
  });

  // Отправка сообщения (только друзьям)
  socket.on('sendMessage', (data) => {
    const currentUser = users.find(u => u.socketId === socket.id);
    if (!currentUser) return;

    // Проверяем, являются ли пользователи друзьями
    if (data.receiverId && !isFriend(currentUser.id, data.receiverId)) {
      socket.emit('messageError', 'Вы можете отправлять сообщения только друзьям');
      return;
    }

    const message = {
      id: Date.now() + Math.random(),
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderAvatar: currentUser.avatar,
      receiverId: data.receiverId,
      groupId: data.groupId,
      text: data.text,
      type: data.type || 'text',
      timestamp: new Date(),
      reactions: [],
      readBy: [currentUser.id]
    };
    
    messages.push(message);
    
    if (data.receiverId) {
      // Личное сообщение другу
      const receiver = users.find(u => u.id === data.receiverId);
      if (receiver && receiver.socketId) {
        io.to(receiver.socketId).emit('newMessage', message);
        
        // Уведомление
        if (receiver.socketId !== socket.id) {
          io.to(receiver.socketId).emit('newNotification', {
            id: Date.now() + Math.random(),
            type: 'message',
            from: currentUser,
            to: receiver.id,
            message: `Новое сообщение от ${currentUser.username}`,
            timestamp: new Date(),
            read: false
          });
        }
      }
    }
    
    // Всегда отправляем отправителю
    socket.emit('newMessage', message);
  });

  // Реакции на сообщения
  socket.on('addReaction', (data) => {
    const message = messages.find(m => m.id === data.messageId);
    const currentUser = users.find(u => u.socketId === socket.id);
    
    if (message && currentUser) {
      const existingReactionIndex = message.reactions.findIndex(r => 
        r.userId === currentUser.id && r.emoji === data.emoji
      );
      
      if (existingReactionIndex > -1) {
        // Удаляем реакцию если уже есть
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Добавляем реакцию
        message.reactions.push({
          userId: currentUser.id,
          username: currentUser.username,
          emoji: data.emoji,
          timestamp: new Date()
        });
      }
      
      // Рассылаем обновленное сообщение участникам чата
      const participants = [message.senderId, message.receiverId].filter(id => id);
      participants.forEach(userId => {
        const user = users.find(u => u.id === userId);
        if (user && user.socketId) {
          io.to(user.socketId).emit('messageUpdated', message);
        }
      });
    }
  });

  // Отметка сообщения как прочитанного
  socket.on('markAsRead', (messageId) => {
    const message = messages.find(m => m.id === messageId);
    const currentUser = users.find(u => u.socketId === socket.id);
    
    if (message && currentUser && !message.readBy.includes(currentUser.id)) {
      message.readBy.push(currentUser.id);
      
      // Уведомляем отправителя о прочтении
      if (message.senderId !== currentUser.id) {
        const sender = users.find(u => u.id === message.senderId);
        if (sender && sender.socketId) {
          io.to(sender.socketId).emit('messageRead', {
            messageId: messageId,
            readerId: currentUser.id,
            readerName: currentUser.username
          });
        }
      }
    }
  });

  // Изменение статуса
  socket.on('updateStatus', (status) => {
    const currentUser = users.find(u => u.socketId === socket.id);
    if (currentUser) {
      currentUser.status = status;
      if (status === 'offline') {
        currentUser.isOnline = false;
        currentUser.lastSeen = new Date();
      } else {
        currentUser.isOnline = true;
      }
      currentUser.lastActive = new Date();
      io.emit('userStatusUpdate', currentUser);
    }
  });

  // Получение pending заявок в друзья
  socket.on('getPendingRequests', () => {
    const currentUser = users.find(u => u.socketId === socket.id);
    if (currentUser) {
      const pendingRequests = friendships.filter(f => 
        f.friendId === currentUser.id && f.status === 'pending'
      ).map(f => ({
        friendship: f,
        user: users.find(u => u.id === f.userId)
      }));
      
      socket.emit('pendingRequests', pendingRequests);
    }
  });

  socket.on('disconnect', () => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      user.isOnline = false;
      user.status = 'offline';
      user.lastSeen = new Date();
      user.lastActive = new Date();
      io.emit('userStatusUpdate', user);
    }
    console.log('🔌 User disconnected:', socket.id);
  });

  // Вспомогательные функции
  function getFriends(userId) {
    const userFriendships = friendships.filter(f => 
      (f.userId === userId || f.friendId === userId) && f.status === 'accepted'
    );
    
    const friendIds = userFriendships.map(f => 
      f.userId === userId ? f.friendId : f.userId
    );
    
    return users.filter(u => friendIds.includes(u.id));
  }

  function isFriend(userId, friendId) {
    return friendships.some(f => 
      ((f.userId === userId && f.friendId === friendId) ||
       (f.friendId === userId && f.userId === friendId)) &&
      f.status === 'accepted'
    );
  }

  function hasPendingRequest(userId, friendId) {
    return friendships.some(f => 
      f.userId === userId && 
      f.friendId === friendId && 
      f.status === 'pending'
    );
  }
});

// API маршруты
app.get('/', (req, res) => {
  res.json({ 
    message: '🌌 Quantum Messenger API is running!',
    version: '4.0',
    features: [
      'Реальные пользователи',
      'Система друзей', 
      'Личные сообщения',
      'Редактирование профиля',
      'Многоязычность',
      'Уведомления'
    ],
    stats: {
      users: users.length,
      messages: messages.length,
      friendships: friendships.length
    }
  });
});

app.get('/api/users', (req, res) => {
  res.json(users);
});

app.get('/api/stats', (req, res) => {
  const stats = {
    totalUsers: users.length,
    onlineUsers: users.filter(u => u.isOnline).length,
    totalMessages: messages.length,
    totalFriendships: friendships.length,
    activeToday: users.filter(u => {
      const today = new Date();
      const userDate = new Date(u.lastActive);
      return userDate.toDateString() === today.toDateString();
    }).length
  };
  res.json(stats);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Quantum Server running on port ${PORT}`);
  console.log(`📊 Real users system activated`);
  console.log(`🔒 Friend-only messaging enabled`);
});
