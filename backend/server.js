const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройки CORS для глобального доступа
const io = socketIo(server, {
  cors: {
    origin: ["https://your-quantum-app.netlify.app", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: ["https://your-quantum-app.netlify.app", "http://localhost:3000"],
  credentials: true
}));

app.use(express.json());

// MongoDB подключение (замени на свой URL из MongoDB Atlas)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/quantum?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Схемы MongoDB
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  socketId: String
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  read: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Хранилище онлайн пользователей
const onlineUsers = new Map();

// WebSocket обработчики
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  // Регистрация пользователя
  socket.on('register', async (userData) => {
    try {
      // Проверяем, нет ли уже такого пользователя
      const existingUser = await User.findOne({
        $or: [
          { username: userData.username },
          { email: userData.email }
        ]
      });

      if (existingUser) {
        socket.emit('registrationError', 'Пользователь с таким именем или email уже существует');
        return;
      }

      const newUser = new User({
        username: userData.username,
        email: userData.email,
        password: userData.password, // В продакшене нужно хэшировать!
        isOnline: true
      });

      await newUser.save();
      
      onlineUsers.set(socket.id, newUser._id);
      
      socket.emit('registrationSuccess', {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email
      });

      // Обновляем список пользователей для всех
      updateOnlineUsers();
      
      console.log('✅ New user registered:', newUser.username);
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('registrationError', 'Ошибка при регистрации');
    }
  });

  // Вход пользователя
  socket.on('login', async (loginData) => {
    try {
      const user = await User.findOne({
        $or: [
          { username: loginData.username },
          { email: loginData.username }
        ],
        password: loginData.password
      });

      if (user) {
        user.isOnline = true;
        user.socketId = socket.id;
        await user.save();
        
        onlineUsers.set(socket.id, user._id);
        
        socket.emit('loginSuccess', {
          id: user._id,
          username: user.username,
          email: user.email
        });

        // Отправляем историю сообщений
        const messages = await Message.find({
          $or: [
            { sender: user._id },
            { receiver: user._id }
          ]
        }).populate('sender receiver', 'username');

        socket.emit('messageHistory', messages);
        updateOnlineUsers();
        
        console.log('✅ User logged in:', user.username);
      } else {
        socket.emit('loginError', 'Неверное имя пользователя или пароль');
      }
    } catch (error) {
      console.error('Login error:', error);
      socket.emit('loginError', 'Ошибка при входе');
    }
  });

  // Отправка сообщения
  socket.on('sendMessage', async (data) => {
    try {
      const message = new Message({
        sender: data.senderId,
        receiver: data.receiverId,
        text: data.text
      });

      await message.save();
      
      // Получаем полные данные сообщения
      const fullMessage = await Message.findById(message._id)
        .populate('sender', 'username')
        .populate('receiver', 'username');

      // Отправляем сообщение получателю если он онлайн
      const receiverSocket = Array.from(onlineUsers.entries())
        .find(([sockId, userId]) => userId.toString() === data.receiverId);
      
      if (receiverSocket) {
        io.to(receiverSocket[0]).emit('newMessage', {
          _id: fullMessage._id,
          senderId: fullMessage.sender._id,
          senderName: fullMessage.sender.username,
          receiverId: fullMessage.receiver._id,
          text: fullMessage.text,
          timestamp: fullMessage.createdAt
        });
      }

      // Отправляем сообщение отправителю
      socket.emit('newMessage', {
        _id: fullMessage._id,
        senderId: fullMessage.sender._id,
        senderName: fullMessage.sender.username,
        receiverId: fullMessage.receiver._id,
        text: fullMessage.text,
        timestamp: fullMessage.createdAt
      });

      console.log('💬 New message from', fullMessage.sender.username, 'to', fullMessage.receiver.username);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Получение списка пользователей
  socket.on('getUsers', async () => {
    try {
      const users = await User.find({}, 'username email isOnline lastSeen')
        .sort({ isOnline: -1, username: 1 });
      socket.emit('usersList', users);
    } catch (error) {
      console.error('Error getting users:', error);
    }
  });

  // Выход пользователя
  socket.on('logout', async (userId) => {
    try {
      const user = await User.findById(userId);
      if (user) {
        user.isOnline = false;
        user.lastSeen = new Date();
        await user.save();
      }
      onlineUsers.delete(socket.id);
      updateOnlineUsers();
    } catch (error) {
      console.error('Logout error:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('🔌 User disconnected:', socket.id);
    
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      try {
        const user = await User.findById(userId);
        if (user) {
          user.isOnline = false;
          user.lastSeen = new Date();
          await user.save();
        }
      } catch (error) {
        console.error('Error updating user status:', error);
      }
      onlineUsers.delete(socket.id);
      updateOnlineUsers();
    }
  });

  async function updateOnlineUsers() {
    try {
      const users = await User.find({}, 'username email isOnline lastSeen')
        .sort({ isOnline: -1, username: 1 });
      io.emit('usersList', users);
    } catch (error) {
      console.error('Error updating users list:', error);
    }
  }
});

// API маршруты
app.get('/', (req, res) => {
  res.json({ 
    message: '🌌 Quantum Messenger API is running!',
    version: '2.0',
    online: onlineUsers.size
  });
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username email isOnline lastSeen')
      .sort({ isOnline: -1, username: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find()
      .populate('sender', 'username')
      .populate('receiver', 'username')
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Quantum Server running on port ${PORT}`);
  console.log(`🌍 Access globally via: https://your-render-app.onrender.com`);
});