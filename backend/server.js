const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');

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

// Подключение к MySQL InfinityFree
const dbConfig = {
  host: 'sql107.infinityfree.com',
  user: 'if0_40056257',
  password: 'dYRGQUKDzUa',
  database: 'if0_40056257_quantum_messenger',
  charset: 'utf8mb4'
};

let db;

async function initDatabase() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL InfinityFree');
    
    // Создаем таблицы если их нет
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100),
        avatar TEXT,
        is_online BOOLEAN DEFAULT false,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'online',
        language VARCHAR(10) DEFAULT 'ru',
        timezone VARCHAR(50) DEFAULT 'Europe/Moscow',
        bio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS friendships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (friend_id) REFERENCES users(id),
        UNIQUE KEY unique_friendship (user_id, friend_id)
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        sender_name VARCHAR(50) NOT NULL,
        sender_avatar TEXT,
        receiver_id INT,
        text TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'text',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_by JSON,
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id)
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        from_user_id INT,
        to_user_id INT NOT NULL,
        message TEXT,
        is_read BOOLEAN DEFAULT false,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user_id) REFERENCES users(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id)
      )
    `);
    
    console.log('✅ Database tables created/verified');
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

// Вспомогательные функции
function getSocketIdByUserId(userId, activeConnections) {
  for (let [socketId, id] of activeConnections.entries()) {
    if (id === userId) {
      return socketId;
    }
  }
  return null;
}

async function getFriends(userId) {
  const [friendships] = await db.execute(`
    SELECT u.*, f.status 
    FROM friendships f 
    JOIN users u ON (u.id = f.friend_id AND f.user_id = ?) OR (u.id = f.user_id AND f.friend_id = ?) 
    WHERE f.status = 'accepted' AND (f.user_id = ? OR f.friend_id = ?)
  `, [userId, userId, userId, userId]);
  
  return friendships.map(friend => ({
    id: friend.id,
    username: friend.username,
    avatar: friend.avatar,
    isOnline: friend.is_online,
    status: friend.status,
    lastSeen: friend.last_seen
  }));
}

// Инициализация базы
initDatabase();

// Хранилище активных подключений
const activeConnections = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Автоматический вход/регистрация
  socket.on('login', async (userData) => {
    try {
      // Поиск или создание пользователя
      const [users] = await db.execute(
        'SELECT * FROM users WHERE username = ?', 
        [userData.username]
      );
      
      let user;
      if (users.length === 0) {
        const [result] = await db.execute(
          `INSERT INTO users (username, email, avatar, is_online, status) 
           VALUES (?, ?, ?, true, 'online')`,
          [
            userData.username,
            userData.email || '',
            `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.username)}&background=667eea&color=fff&bold=true`
          ]
        );
        
        const [newUsers] = await db.execute(
          'SELECT * FROM users WHERE id = ?',
          [result.insertId]
        );
        user = newUsers[0];
      } else {
        user = users[0];
        await db.execute(
          'UPDATE users SET is_online = true, status = "online", last_active = NOW() WHERE id = ?',
          [user.id]
        );
      }
      
      activeConnections.set(socket.id, user.id);
      socket.userId = user.id;
      
      // Отправка данных пользователю
      socket.emit('loginSuccess', {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        isOnline: user.is_online,
        status: user.status,
        language: user.language,
        timezone: user.timezone,
        bio: user.bio,
        createdAt: user.created_at,
        lastActive: user.last_active
      });
      
      // Отправляем историю сообщений
      const [messages] = await db.execute(`
        SELECT * FROM messages 
        WHERE sender_id = ? OR receiver_id = ? 
        ORDER BY timestamp ASC
      `, [user.id, user.id]);
      
      socket.emit('messageHistory', messages);
      
      // Отправляем список пользователей
      const [allUsers] = await db.execute('SELECT * FROM users');
      socket.emit('usersList', allUsers.map(u => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        isOnline: u.is_online,
        status: u.status,
        lastSeen: u.last_seen
      })));
      
      // Отправляем друзей
      const friends = await getFriends(user.id);
      socket.emit('friendsList', friends);
      
      // Уведомляем всех о новом онлайн пользователе
      io.emit('userStatusUpdate', {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        isOnline: true,
        status: 'online',
        lastSeen: user.last_seen
      });
      
      console.log('🔓 User logged in:', user.username);
    } catch (error) {
      console.error('Login error:', error);
      socket.emit('loginError', 'Ошибка входа');
    }
  });

  // Отправка сообщения
  socket.on('sendMessage', async (data) => {
    try {
      const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [socket.userId]);
      const currentUser = users[0];
      
      if (!currentUser) return;

      // Проверяем дружбу
      if (data.receiverId) {
        const [friendships] = await db.execute(
          `SELECT * FROM friendships 
           WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) 
           AND status = 'accepted'`,
          [socket.userId, data.receiverId, data.receiverId, socket.userId]
        );

        if (friendships.length === 0) {
          socket.emit('messageError', 'Вы можете отправлять сообщения только друзьям');
          return;
        }
      }

      const [result] = await db.execute(
        `INSERT INTO messages (sender_id, sender_name, sender_avatar, receiver_id, text, type, read_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          socket.userId,
          currentUser.username,
          currentUser.avatar,
          data.receiverId,
          data.text,
          data.type || 'text',
          JSON.stringify([socket.userId])
        ]
      );

      const [newMessages] = await db.execute('SELECT * FROM messages WHERE id = ?', [result.insertId]);
      const message = newMessages[0];
      
      if (data.receiverId) {
        const receiverSocketId = getSocketIdByUserId(data.receiverId, activeConnections);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('newMessage', message);
        }
      }
      
      socket.emit('newMessage', message);
      
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('messageError', 'Ошибка отправки сообщения');
    }
  });

  // Добавление в друзья
  socket.on('addFriend', async (friendId) => {
    try {
      const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [socket.userId]);
      const currentUser = users[0];
      
      if (!currentUser) return;

      const [existing] = await db.execute(
        `SELECT * FROM friendships 
         WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
        [socket.userId, friendId, friendId, socket.userId]
      );

      if (existing.length === 0) {
        await db.execute(
          'INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, "pending")',
          [socket.userId, friendId]
        );
        
        const [friends] = await db.execute('SELECT * FROM users WHERE id = ?', [friendId]);
        const friend = friends[0];
        
        if (friend) {
          await db.execute(
            `INSERT INTO notifications (type, from_user_id, to_user_id, message) 
             VALUES ('friend_request', ?, ?, ?)`,
            [socket.userId, friendId, `${currentUser.username} отправил вам запрос в друзья`]
          );
          
          const friendSocketId = getSocketIdByUserId(friendId, activeConnections);
          if (friendSocketId) {
            io.to(friendSocketId).emit('newNotification', {
              message: `${currentUser.username} отправил вам запрос в друзья`
            });
          }
        }
        
        socket.emit('friendRequestSent', {
          id: friend.id,
          username: friend.username,
          avatar: friend.avatar
        });
      }
    } catch (error) {
      console.error('Add friend error:', error);
    }
  });

  // Отключение пользователя
  socket.on('disconnect', async () => {
    try {
      const userId = activeConnections.get(socket.id);
      if (userId) {
        await db.execute(
          'UPDATE users SET is_online = false, status = "offline", last_seen = NOW() WHERE id = ?',
          [userId]
        );
        
        io.emit('userStatusUpdate', {
          id: userId,
          isOnline: false,
          status: 'offline',
          lastSeen: new Date()
        });
        
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
    database: 'MySQL InfinityFree'
  });
});

app.get('/api/stats', async (req, res) => {
  try {
    const [[{totalUsers}]] = await db.execute('SELECT COUNT(*) as totalUsers FROM users');
    const [[{onlineUsers}]] = await db.execute('SELECT COUNT(*) as onlineUsers FROM users WHERE is_online = true');
    const [[{totalMessages}]] = await db.execute('SELECT COUNT(*) as totalMessages FROM messages');
    const [[{totalFriendships}]] = await db.execute('SELECT COUNT(*) as totalFriendships FROM friendships WHERE status = "accepted"');
    
    const stats = {
      totalUsers,
      onlineUsers,
      totalMessages,
      totalFriendships
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Quantum Server running on port ${PORT}`);
  console.log(`🗄️ MySQL InfinityFree Database`);
  console.log(`🔒 Friend-only messaging enabled`);
});
