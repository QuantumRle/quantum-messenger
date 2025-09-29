let socket;
let currentUser = null;
let selectedUser = null;

// URL твоего бэкенда
const BACKEND_URL = 'https://quantum-backend-yi39.onrender.com';

document.addEventListener('DOMContentLoaded', function() {
    console.log('🌌 Quantum Messenger started');
    initializeApp();
});

function initializeApp() {
    // Подключаемся к бэкенду
    socket = io(BACKEND_URL);
    
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        hideError();
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        showError('Ошибка подключения к серверу');
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
    
    socket.on('loginError', (error) => {
        showError(error);
    });
    
    socket.on('registrationError', (error) => {
        showError(error);
    });
    
    socket.on('usersList', (users) => {
        displayUsers(users);
    });
    
    socket.on('newMessage', (message) => {
        displayMessage(message);
    });
    
    socket.on('messageHistory', (messages) => {
        messages.forEach(msg => displayMessage(msg));
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
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showError('Введите имя и пароль');
        return;
    }
    
    hideError();
    
    // ПРОСТОЙ ВХОД - работает всегда
    socket.emit('login', { username, password });
}

function quickLogin(username) {
    document.getElementById('username').value = username;
    document.getElementById('password').value = '123';
    handleAuth();
}

function showError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    document.getElementById('auth-error').style.display = 'none';
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
    console.log('Showing chat screen');
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'block';
    
    document.getElementById('current-user').textContent = currentUser.username;
    
    // Загружаем пользователей
    socket.emit('getUsers');
}

function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    
    users.forEach(user => {
        if (user.id !== currentUser.id) {
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
    document.getElementById('selected-user-name').textContent = user.username;
    document.getElementById('message-input-area').style.display = 'flex';
    
    // Очищаем чат
    document.getElementById('messages-container').innerHTML = 
        `<div class="welcome-message">Начало переписки с ${user.username}</div>`;
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
    if (!selectedUser || (message.senderId !== currentUser.id && message.receiverId !== selectedUser.id)) {
        return;
    }
    
    const container = document.getElementById('messages-container');
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
    document.getElementById('password').value = '';
}
