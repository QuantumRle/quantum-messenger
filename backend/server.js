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

// Временное хранилище
let users = [];
let messages = [];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Регистрация
  socket.on('register', (userData) => {
    const newUser = {
      id: Date.now(),
      username: userData.username,
      email: userData.email,
      password: userData.password,
      isOnline: true
    };
    users.push(newUser);
    socket.emit('registrationSuccess', newUser);
    io.emit('usersList', users);
  });

  // Вход
  socket.on('login', (loginData) => {
    const user = users.find(u => u.username === loginData.username && u.password === loginData.password);
    if (user) {
      user.isOnline = true;
      socket.emit('loginSuccess', user);
      socket.emit('messageHistory', messages);
      io.emit('usersList', users);
    } else {
      socket.emit('loginError', 'Неверные данные');
    }
  });

  // Сообщения
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
  });

  // Список пользователей
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
