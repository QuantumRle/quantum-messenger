let socket;
let currentUser = null;
let selectedUser = null;
let allMessages = [];
let allUsers = [];

// URL бэкенда (замени на свой Render URL)
const BACKEND_URL = 'https://your-quantum-backend.onrender.com';

document.addEventListener('DOMContentLoaded', function() {
    console.log('🌌 Quantum Messenger Global Edition started...');
    initializeSocket();
    setupEventListeners();
});

function initializeSocket() {
    socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
        console.log('✅ Connected to global server');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        updateConnectionStatus(false);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showError('Ошибка подключения к серверу');
    });
    
    // Обработчики событий
    socket.on('registrationSuccess', (user) => {
        console.log('✅ Registration success:', user);
        currentUser = user;
        showChatScreen();
    });
    
    socket.on('registrationError', (error) => {
        console.log('❌ Registration error:', error);
        showError(error);
    });
    
    socket.on('loginSuccess', (user) => {
        console.log('✅ Login success:', user);
        currentUser = user;
        socket.emit('setUser', user.id);
        showChatScreen();
    });
    
    socket.on('loginError', (error) => {
        console.log('❌ Login error:', error);
        showError(error);
    });
    
    socket.on('newMessage', (message) => {
        console.log('💬 New message:', message);
        allMessages.push(message);
        if (selectedUser && 
            (message.senderId === selectedUser.id || message.receiverId === selectedUser.id)) {
            displayMessage(message);
        }
    });
    
    socket.on('messageHistory', (messages) => {
        console.log('📨 Message history loaded:', messages.length);
        allMessages = messages;
        if (selectedUser) {
            displayMessagesForSelectedUser();
        }
    });
    
    socket.on('usersList', (users) => {
        console.log('👥 Users list updated:', users.length);
        allUsers = users;
        updateOnlineCount(users);
        displayUsers(users);
    });
}

function setupEventListeners() {
    const authButton = document.getElementById('auth-button');
    const passwordField = document.getElementById('password');
    
    if (authButton) {
        authButton.addEventListener('click', handleAuth);
    }
    
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleAuth();
        });
    }
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('online-count');
    if (statusElement) {
        if (connected) {
            statusElement.innerHTML = '🟢 Подключено';
        } else {
            statusElement.innerHTML = '🔴 Переподключение...';
        }
    }
}

function updateOnlineCount(users) {
    const onlineCount = users.filter(user => user.isOnline).length;
    const totalCount = users.length;
    const countElement = document.getElementById('online-count');
    if (countElement) {
        countElement.textContent = `${onlineCount}/${totalCount} онлайн`;
    }
}

function handleAuth() {
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const isLogin = document.getElementById('auth-title').textContent === 'Вход в систему';
    
    if (!username || !password) {
        showError('Заполните все поля!');
        return;
    }
    
    if (!isLogin && !email) {
        showError('Введите email для регистрации!');
        return;
    }
    
    hideError();
    
    if (isLogin) {
        socket.emit('login', {
            username: username,
            password: password
        });
    } else {
        socket.emit('register', {
            username: username,
            email: email,
            password: password
        });
    }
}

function quickLogin(username) {
    document.getElementById('username').value = username;
    document.getElementById('password').value = '123456';
    handleAuth();
}

function showError(message) {
    const errorDiv = document.getElementById('auth-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function hideError() {
    const errorDiv = document.getElementById('auth-error');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
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
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('chat-screen').classList.add('active');
    document.getElementById('current-user').textContent = currentUser.username;
    
    // Загружаем список пользователей
    socket.emit('getUsers');
}

function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    users.forEach(user => {
        if (user._id !== currentUser.id) {
            const userElement = createUserElement(user);
            usersList.appendChild(userElement);
        }
    });
}

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.onclick = () => selectUser(user);
    
    const lastSeen = user.isOnline ? 'online' : 
        `был(а) ${new Date(user.lastSeen).toLocaleDateString('ru-RU')}`;
    
    userElement.innerHTML = `
        <div class="user-info-small">
            <span class="status-${user.isOnline ? 'online' : 'offline'}"></span>
            <div>
                <div class="username">${user.username}</div>
                <div class="user-status">${lastSeen}</div>
            </div>
        </div>
    `;
    
    return userElement;
}

function searchUsers() {
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    const userItems = document.querySelectorAll('.user-item');
    
    userItems.forEach(item => {
        const username = item.querySelector('.username').textContent.toLowerCase();
        if (username.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function selectUser(user) {
    selectedUser = user;
    
    // Подсветка выбранного пользователя
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    // Обновляем заголовок чата
    document.getElementById('selected-user-name').textContent = user.username;
    updateSelectedUserStatus(user);
    
    // Показываем поле ввода сообщения
    document.getElementById('message-input-area').style.display = 'flex';
    
    displayMessagesForSelectedUser();
}

function updateSelectedUserStatus(user) {
    const statusElement = document.getElementById('user-status');
    if (user.isOnline) {
        statusElement.className = 'status-online';
        statusElement.textContent = ' online';
    } else {
        statusElement.className = 'status-offline';
        statusElement.textContent = ' offline';
    }
}

function displayMessagesForSelectedUser() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    
    const userMessages = allMessages.filter(msg => 
        (msg.senderId === currentUser.id && msg.receiverId === selectedUser.id) ||
        (msg.senderId === selectedUser.id && msg.receiverId === currentUser.id)
    );
    
    if (userMessages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">💬</div>
                <h3>Начало переписки с ${selectedUser.username}</h3>
                <p>Напишите первое сообщение!</p>
            </div>
        `;
    } else {
        userMessages.forEach(message => displayMessage(message));
    }
}

function displayMessage(message) {
    const container = document.getElementById('messages-container');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === currentUser.id ? 'own' : 'other'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        ${message.senderId !== currentUser.id ? `<div class="message-sender">${message.senderName}</div>` : ''}
        <div class="message-text">${message.text}</div>
        <div class="message-time">${time}</div>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    if (!selectedUser) {
        alert('Выберите пользователя для отправки сообщения!');
        return;
    }
    
    const textInput = document.getElementById('message-text');
    const text = textInput.value.trim();
    
    if (!text) return;
    
    const messageData = {
        senderId: currentUser.id,
        senderName: currentUser.username,
        receiverId: selectedUser._id || selectedUser.id,
        text: text
    };
    
    socket.emit('sendMessage', messageData);
    textInput.value = '';
}

function logout() {
    if (currentUser) {
        socket.emit('logout', currentUser.id);
    }
    currentUser = null;
    selectedUser = null;
    document.getElementById('chat-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
    
    // Очищаем форму
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('email').value = '';
}

// Добавляем стили для статуса пользователя
const style = document.createElement('style');
style.textContent = `
    .user-status {
        font-size: 0.7rem;
        color: #666;
        margin-top: 2px;
    }
    .username {
        font-weight: 600;
    }
`;
document.head.appendChild(style);