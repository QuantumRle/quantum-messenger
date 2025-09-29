const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// FIX CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

let users = [];
let messages = [];

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // ПРОСТАЯ РЕГИСТРАЦИЯ
  socket.on('register', (userData) => {
    const newUser = {
      id: Date.now(),
      username: userData.username,
      isOnline: true
    };
    users.push(newUser);
    socket.emit('registrationSuccess', newUser);
    io.emit('usersList', users);
    console.log('👤 New user:', newUser.username);
  });

  // ПРОСТОЙ ВХОД
  socket.on('login', (loginData) => {
    let user = users.find(u => u.username === loginData.username);
    
    if (!user) {
      // Автоматически создаем пользователя
      user = {
        id: Date.now(),
        username: loginData.username,
        isOnline: true
      };
      users.push(user);
    }
    
    user.isOnline = true;
    socket.emit('loginSuccess', user);
    socket.emit('messageHistory', messages);
    io.emit('usersList', users);
    console.log('🔓 User logged in:', user.username);
  });

  // ОТПРАВКА СООБЩЕНИЙ
  socket.on('sendMessage', (data) => {
    const message = {
      id: Date.now(),
      senderId: data.senderId,
      senderName: data.senderName,
      receiverId: data.receiverId,
      text: data.text,
      timestamp: new Date()
    };
    messages.push(message);
    io.emit('newMessage', message);
    console.log('💬 Message from', data.senderName);
  });

  // ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЕЙ
  socket.on('getUsers', () => {
    socket.emit('usersList', users);
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: '🌌 Quantum Messenger API is running!',
    users: users.length,
    messages: messages.length
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
