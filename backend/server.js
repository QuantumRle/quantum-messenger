const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// FIX CORS!
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// FIX CORS!
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());

let users = [];
let messages = [];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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

  socket.on('getUsers', () => {
    socket.emit('usersList', users);
  });
});

// FIX CORS для API!
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
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
