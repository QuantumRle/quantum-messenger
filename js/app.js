let socket;
let currentUser = null;
let selectedUser = null;
let allMessages = [];
let allUsers = [];

const BACKEND_URL = 'https://quantum-backend-yi39.onrender.com';

document.addEventListener('DOMContentLoaded', function() {
    console.log('🌌 Quantum Messenger started');
    initializeApp();
});

function initializeApp() {
    // Подключаемся к серверу
    socket = io(BACKEND_URL);
    
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        hideError();
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        showError('Ошибка подключения');
    });
    
    // Обработчики событий
    socket.on('loginSuccess', (user) => {
        console.log('✅ Login success:', user);
        currentUser = user;
        showChatScreen();
    });
    
    socket.on('registrationSuccess', (user) => {
        console.log('✅ Registration success:', user);
        currentUser = user;
        showChatScreen();
    });
    
    socket.on('usersList', (users) => {
        console.log('👥 Users list:', users);
        allUsers = users;
        displayUsers(users);
    });
    
    socket.on('newMessage', (message) => {
        console.log('💬 New message:', message);
        allMessages.push(message);
        if (selectedUser) {
            displayMessage(message);
        }
    });
    
    socket.on('messageHistory', (messages) => {
        console.log('📨 Message history:', messages);
        allMessages = messages;
    });
    
    // Настройка кнопок
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('auth-button').addEventListener('click', handleAuth);
    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
    });
}

function handleAuth() {
    const username = document.getElementById('username').value.trim();
    
    if (!username) {
        showError('Введите имя пользователя');
        return;
    }
    
    hideError();
    
    // ПРОСТОЙ ВХОД - работает всегда
    socket.emit('login', { username: username, password: 'any' });
}

function quickLogin(username) {
    document.getElementById('username').value = username;
    handleAuth();
}

function showError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.style.display = 'none';
}

function switchAuth() {
    const title = document.getElementById('auth-title');
    const button = document.getElementById('auth-button');
    const switchText = document.getElementById('auth-switch');
    const emailField = document.getElementById('email');
    
    if (title.textContent === 'Вход в систему') {
        title.textContent = 'Регистрация';
        button.textContent = 'Зарегистрироваться';
        switchText.innerHTML = 'Есть аккаунт? <a href="#" onclick="switchAuth()">Войти</a>';
        emailField.style.display = 'block';
    } else {
        title.textContent = 'Вход в систему';
        button.textContent = 'Войти';
        switchText.innerHTML = 'Нет аккаунта? <a href="#" onclick="switchAuth()">Зарегистрироваться</a>';
        emailField.style.display = 'none';
    }
    hideError();
}

function showChatScreen() {
    console.log('🔄 Showing chat screen');
    
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'block';
    
    document.getElementById('current-user').textContent = currentUser.username;
    
    // Загружаем пользователей
    socket.emit('getUsers');
}

function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    
    // Добавляем тестовых пользователей
    const testUsers = [
        { id: 1, username: 'Иван', isOnline: true },
        { id: 2, username: 'Мария', isOnline: true },
        { id: 3, username: 'Алексей', isOnline: true },
        { id: 4, username: 'Анна', isOnline: true }
    ];
    
    const allUsersList = [...testUsers, ...users.filter(u => u.id !== currentUser.id)];
    
    allUsersList.forEach(user => {
        if (user.username !== currentUser.username) {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            userElement.innerHTML = `
                <div class="user-info-small">
                    <span class="status-${user.isOnline ? 'online' : 'offline'}"></span>
                    <span>${user.username}</span>
                </div>
            `;
            userElement.onclick = () => selectUser(user);
            usersList.appendChild(userElement);
        }
    });
}

function selectUser(user) {
    selectedUser = user;
    console.log('👤 Selected user:', user.username);
    
    document.getElementById('selected-user-name').textContent = user.username;
    document.getElementById('message-input-area').style.display = 'flex';
    
    // Очищаем и показываем чат
    const container = document.getElementById('messages-container');
    container.innerHTML = `<div class="welcome-message">Начало переписки с ${user.username}</div>`;
    
    // Показываем историю сообщений
    const userMessages = allMessages.filter(msg => 
        (msg.senderId === currentUser.id && msg.receiverId === user.id) ||
        (msg.senderId === user.id && msg.receiverId === currentUser.id)
    );
    
    userMessages.forEach(message => displayMessage(message));
}

function sendMessage() {
    if (!selectedUser) {
        alert('Выберите пользователя');
        return;
    }
    
    const textInput = document.getElementById('message-text');
    const text = textInput.value.trim();
    
    if (!text) return;
    
    socket.emit('sendMessage', {
        senderId: currentUser.id,
        senderName: currentUser.username,
        receiverId: selectedUser.id,
        text: text
    });
    
    textInput.value = '';
}

function displayMessage(message) {
    const container = document.getElementById('messages-container');
    
    // Убираем welcome сообщение если есть
    if (container.querySelector('.welcome-message')) {
        container.innerHTML = '';
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === currentUser.id ? 'own' : 'other'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        ${message.senderId !== currentUser.id ? `<div class="message-sender">${message.senderName}</div>` : ''}
        <div class="message-text">${message.text}</div>
        <div class="message-time">${time}</div>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function logout() {
    currentUser = null;
    selectedUser = null;
    document.getElementById('chat-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
    document.getElementById('username').value = '';
}
