const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

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

// Подключение к MongoDB Atlas
const MONGODB_URI = 'mongodb+srv://alekseyreetilo92_db_user:X0GRrC0ioe6kF5du@quantun.2rz1att.mongodb.net/quantum_messenger?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Схемы базы данных
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: String,
  avatar: String,
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  status: { type: String, default: 'online' },
  language: { type: String, default: 'ru' },
  timezone: { type: String, default: 'Europe/Moscow' },
  bio: String,
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: String,
  senderAvatar: String,
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: String,
  type: { type: String, default: 'text' },
  timestamp: { type: Date, default: Date.now },
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    emoji: String,
    timestamp: { type: Date, default: Date.now }
  }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const friendshipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: String,
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const Friendship = mongoose.model('Friendship', friendshipSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// Хранилище активных подключений
const activeConnections = new Map();

// Вспомогательные функции
function getSocketIdByUserId(userId) {
  for (let [socketId, id] of activeConnections.entries()) {
    if (id.toString() === userId.toString()) {
      return socketId;
    }
  }
  return null;
}

async function getFriends(userId) {
  const friendships = await Friendship.find({
    $or: [
      { userId: userId, status: 'accepted' },
      { friendId: userId, status: 'accepted' }
    ]
  }).populate('userId', 'username avatar isOnline status lastSeen')
    .populate('friendId', 'username avatar isOnline status lastSeen');
  
  return friendships.map(f => {
    const friend = f.userId._id.toString() === userId.toString() ? f.friendId : f.userId;
    return {
      id: friend._id,
      username: friend.username,
      avatar: friend.avatar,
      isOnline: friend.isOnline,
      status: friend.status,
      lastSeen: friend.lastSeen
    };
  });
}

io.on('connection', async (socket) => {
  console.log('✅ User connected:', socket.id);

  // Автоматический вход/регистрация
  socket.on('login', async (userData) => {
    try {
      let user = await User.findOne({ username: new RegExp(`^${userData.username}$`, 'i') });
      
      if (!user) {
        user = new User({
          username: userData.username,
          email: userData.email || '',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username)}&background=667eea&color=fff&bold=true`,
          isOnline: true,
          status: 'online'
        });
        await user.save();
      } else {
        user.isOnline = true;
        user.status = 'online';
        user.lastActive = new Date();
        await user.save();
      }

      activeConnections.set(socket.id, user._id);
      socket.userId = user._id;

      // Отправляем данные пользователю
      const userObj = user.toObject();
      socket.emit('loginSuccess', {
        id: userObj._id,
        username: userObj.username,
        email: userObj.email,
        avatar: userObj.avatar,
        isOnline: userObj.isOnline,
        status: userObj.status,
        language: userObj.language,
        timezone: userObj.timezone,
        bio: userObj.bio,
        createdAt: userObj.createdAt,
        lastActive: userObj.lastActive
      });
      
      // Отправляем историю сообщений
      const userMessages = await Message.find({
        $or: [
          { senderId: user._id },
          { receiverId: user._id }
        ]
      }).populate('senderId', 'username avatar').sort({ timestamp: 1 });
      
      socket.emit('messageHistory', userMessages.map(m => ({
        id: m._id,
        senderId: m.senderId._id,
        senderName: m.senderName,
        senderAvatar: m.senderAvatar,
        receiverId: m.receiverId,
        text: m.text,
        type: m.type,
        timestamp: m.timestamp,
        reactions: m.reactions
      })));
      
      // Отправляем список пользователей
      const users = await User.find({}).select('username avatar isOnline status lastSeen lastActive');
      socket.emit('usersList', users.map(u => ({
        id: u._id,
        username: u.username,
        avatar: u.avatar,
        isOnline: u.isOnline,
        status: u.status,
        lastSeen: u.lastSeen
      })));
      
      // Отправляем друзей
      const userFriends = await getFriends(user._id);
      socket.emit('friendsList', userFriends);
      
      // Уведомляем всех о новом онлайн пользователе
      io.emit('userStatusUpdate', {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        isOnline: true,
        status: 'online',
        lastSeen: user.lastSeen
      });
      
      console.log('🔓 User logged in:', user.username);
    } catch (error) {
      console.error('Login error:', error);
      socket.emit('loginError', 'Ошибка входа');
    }
  });

  // Обновление профиля
  socket.on('updateProfile', async (profileData) => {
    try {
      const user = await User.findById(socket.userId);
      if (user) {
        if (profileData.username) user.username = profileData.username;
        if (profileData.email) user.email = profileData.email;
        if (profileData.bio) user.bio = profileData.bio;
        if (profileData.language) user.language = profileData.language;
        if (profileData.timezone) user.timezone = profileData.timezone;
        if (profileData.avatar) user.avatar = profileData.avatar;
        
        await user.save();
        
        socket.emit('profileUpdateSuccess', {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          bio: user.bio,
          language: user.language,
          timezone: user.timezone
        });
        
        console.log('📝 Profile updated:', user.username);
      }
    } catch (error) {
      console.error('Profile update error:', error);
      socket.emit('profileUpdateError', 'Ошибка обновления профиля');
    }
  });

  // Поиск пользователей
  socket.on('searchUsers', async (searchTerm) => {
    try {
      const currentUser = await User.findById(socket.userId);
      if (!currentUser) return;

      const users = await User.find({
        username: { $regex: searchTerm, $options: 'i' },
        _id: { $ne: currentUser._id }
      }).select('username avatar isOnline status lastSeen');

      const results = await Promise.all(users.map(async (user) => {
        const isFriend = await Friendship.findOne({
          $or: [
            { userId: currentUser._id, friendId: user._id, status: 'accepted' },
            { userId: user._id, friendId: currentUser._id, status: 'accepted' }
          ]
        });
        
        const hasPendingRequest = await Friendship.findOne({
          userId: currentUser._id,
          friendId: user._id,
          status: 'pending'
        });

        return {
          id: user._id,
          username: user.username,
          avatar: user.avatar,
          isOnline: user.isOnline,
          status: user.status,
          lastSeen: user.lastSeen,
          isFriend: !!isFriend,
          hasPendingRequest: !!hasPendingRequest
        };
      }));
      
      socket.emit('searchResults', results);
    } catch (error) {
      console.error('Search error:', error);
    }
  });

  // Добавление в друзья
  socket.on('addFriend', async (friendId) => {
    try {
      const currentUser = await User.findById(socket.userId);
      if (!currentUser) return;

      const existingFriendship = await Friendship.findOne({
        $or: [
          { userId: currentUser._id, friendId: friendId },
          { userId: friendId, friendId: currentUser._id }
        ]
      });

      if (!existingFriendship) {
        const friendship = new Friendship({
          userId: currentUser._id,
          friendId: friendId,
          status: 'pending'
        });
        await friendship.save();
        
        const friend = await User.findById(friendId);
        if (friend) {
          const notification = new Notification({
            type: 'friend_request',
            from: currentUser._id,
            to: friendId,
            message: `${currentUser.username} отправил вам запрос в друзья`
          });
          await notification.save();
          
          const friendSocketId = getSocketIdByUserId(friendId);
          if (friendSocketId) {
            io.to(friendSocketId).emit('newNotification', {
              id: notification._id,
              type: notification.type,
              message: notification.message,
              timestamp: notification.timestamp,
              read: notification.read
            });
            
            io.to(friendSocketId).emit('friendRequest', {
              from: {
                id: currentUser._id,
                username: currentUser.username,
                avatar: currentUser.avatar
              }
            });
          }
        }
        
        socket.emit('friendRequestSent', {
          id: friend._id,
          username: friend.username,
          avatar: friend.avatar
        });
      }
    } catch (error) {
      console.error('Add friend error:', error);
    }
  });

  // Принятие заявки в друзья
  socket.on('acceptFriend', async (friendshipId) => {
    try {
      const friendship = await Friendship.findById(friendshipId);
      if (friendship && friendship.friendId.toString() === socket.userId.toString()) {
        friendship.status = 'accepted';
        await friendship.save();
        
        const user = await User.findById(friendship.userId);
        const friend = await User.findById(friendship.friendId);
        
        const userSocketId = getSocketIdByUserId(user._id);
        if (userSocketId) {
          io.to(userSocketId).emit('friendAccepted', {
            id: friend._id,
            username: friend.username,
            avatar: friend.avatar,
            isOnline: friend.isOnline
          });
        }
        
        const userFriends = await getFriends(friendship.userId);
        const friendFriends = await getFriends(friendship.friendId);
        
        io.to(getSocketIdByUserId(friendship.userId)).emit('friendsList', userFriends);
        socket.emit('friendsList', friendFriends);
      }
    } catch (error) {
      console.error('Accept friend error:', error);
    }
  });

  // Получение pending заявок
  socket.on('getPendingRequests', async () => {
    try {
      const pendingRequests = await Friendship.find({
        friendId: socket.userId,
        status: 'pending'
      }).populate('userId', 'username avatar');
      
      socket.emit('pendingRequests', pendingRequests.map(req => ({
        friendship: {
          id: req._id,
          status: req.status,
          createdAt: req.createdAt
        },
        user: {
          id: req.userId._id,
          username: req.userId.username,
          avatar: req.userId.avatar
        }
      })));
    } catch (error) {
      console.error('Get pending requests error:', error);
    }
  });

  // Отправка сообщения
  socket.on('sendMessage', async (data) => {
    try {
      const currentUser = await User.findById(socket.userId);
      if (!currentUser) return;

      // Проверяем дружбу
      if (data.receiverId) {
        const areFriends = await Friendship.findOne({
          $or: [
            { userId: currentUser._id, friendId: data.receiverId, status: 'accepted' },
            { userId: data.receiverId, friendId: currentUser._id, status: 'accepted' }
          ]
        });

        if (!areFriends) {
          socket.emit('messageError', 'Вы можете отправлять сообщения только друзьям');
          return;
        }
      }

      const message = new Message({
        senderId: currentUser._id,
        senderName: currentUser.username,
        senderAvatar: currentUser.avatar,
        receiverId: data.receiverId,
        text: data.text,
        type: data.type || 'text',
        readBy: [currentUser._id]
      });
      await message.save();

      const messageObj = message.toObject();
      
      if (data.receiverId) {
        const receiverSocketId = getSocketIdByUserId(data.receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('newMessage', messageObj);
        }
      }
      
      socket.emit('newMessage', messageObj);
      
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('messageError', 'Ошибка отправки сообщения');
    }
  });

  // Изменение статуса
  socket.on('updateStatus', async (status) => {
    try {
      const user = await User.findById(socket.userId);
      if (user) {
        user.status = status;
        user.isOnline = status !== 'offline';
        if (status === 'offline') {
          user.lastSeen = new Date();
        }
        user.lastActive = new Date();
        await user.save();
        
        io.emit('userStatusUpdate', {
          id: user._id,
          username: user.username,
          avatar: user.avatar,
          isOnline: user.isOnline,
          status: user.status,
          lastSeen: user.lastSeen
        });
      }
    } catch (error) {
      console.error('Update status error:', error);
    }
  });

  // Отключение пользователя
  socket.on('disconnect', async () => {
    try {
      const userId = activeConnections.get(socket.id);
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          user.isOnline = false;
          user.status = 'offline';
          user.lastSeen = new Date();
          await user.save();
          
          io.emit('userStatusUpdate', {
            id: user._id,
            username: user.username,
            avatar: user.avatar,
            isOnline: false,
            status: 'offline',
            lastSeen: user.lastSeen
          });
        }
        activeConnections.delete(socket.id);
      }
      console.log('🔌 User disconnected:', socket.id);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

// API маршруты
app.get('/', (req, res) => {
  res.json({ 
    message: '🌌 Quantum Messenger API is running!',
    version: '4.0',
    features: [
      'Реальные пользователи',
      'Система друзей с MongoDB', 
      'Личные сообщения',
      'Редактирование профиля',
      'Многоязычность',
      'Уведомления',
      'Persistent Data Storage'
    ],
    database: 'MongoDB Atlas Connected'
  });
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const onlineUsers = await User.countDocuments({ isOnline: true });
    const totalMessages = await Message.countDocuments();
    const totalFriendships = await Friendship.countDocuments({ status: 'accepted' });
    
    const stats = {
      totalUsers,
      onlineUsers,
      totalMessages,
      totalFriendships,
      activeToday: await User.countDocuments({
        lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Quantum Server running on port ${PORT}`);
  console.log(`🗄️ MongoDB Atlas Connected`);
  console.log(`🔒 Friend-only messaging enabled`);
});
