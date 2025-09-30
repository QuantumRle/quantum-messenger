let socket;
let currentUser = null;
let selectedChat = null;
let allMessages = [];
let allUsers = [];
let friends = [];
let notifications = [];

const BACKEND_URL = 'https://quantum-backend-yi39.onrender.com';

document.addEventListener('DOMContentLoaded', function() {
    console.log('🌌 Quantum Messenger started');
    initializeApp();
});

function initializeApp() {
    socket = io(BACKEND_URL);
    
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        hideError();
        showNotification('Подключено к серверу', 'success');
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
        updateUserAvatar();
        showNotification(`Добро пожаловать, ${user.username}!`, 'success');
    });
    
    socket.on('usersList', (users) => {
        console.log('👥 Users list:', users.length);
        allUsers = users;
        updateOnlineCount();
    });
    
    socket.on('friendsList', (friendsList) => {
        console.log('🤝 Friends list:', friendsList.length);
        friends = friendsList;
        renderFriendsList();
        updateFriendsStats();
    });
    
    socket.on('newMessage', (message) => {
        console.log('💬 New message:', message);
        allMessages.push(message);
        
        if (selectedChat && selectedChat.id === message.senderId) {
            displayMessage(message);
        } else if (message.senderId !== currentUser.id) {
            showNotification(`Новое сообщение от ${message.senderName}`, 'info');
        }
    });
    
    socket.on('messageHistory', (messages) => {
        console.log('📨 Message history:', messages.length);
        allMessages = messages;
        if (selectedChat) {
            displayChatHistory();
        }
    });
    
    socket.on('searchResults', (results) => {
        renderSearchResults(results);
    });
    
    socket.on('friendRequest', (data) => {
        console.log('📩 Friend request from:', data.from.username);
        showNotification(`${data.from.username} отправил запрос в друзья`, 'info');
        refreshRequests();
    });
    
    socket.on('friendAccepted', (friend) => {
        console.log('✅ Friend accepted:', friend.username);
        showNotification(`${friend.username} принял вашу заявку в друзья`, 'success');
        renderFriendsList();
    });
    
    socket.on('userStatusUpdate', (user) => {
        const index = allUsers.findIndex(u => u.id === user.id);
        if (index > -1) {
            allUsers[index] = user;
        }
        updateOnlineCount();
        renderFriendsList();
        
        if (selectedChat && selectedChat.id === user.id) {
            updateChatStatus(user);
        }
    });
    
    socket.on('newNotification', (notification) => {
        console.log('🔔 New notification:', notification);
        notifications.push(notification);
        updateNotificationBadge();
    });
    
    socket.on('pendingRequests', (requests) => {
        renderPendingRequests(requests);
    });

    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('auth-button').addEventListener('click', handleAuth);
    document.getElementById('username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            closeAllDropdowns();
        }
    });
}

function handleAuth() {
    const username = document.getElementById('username').value.trim();
    
    if (!username) {
        showError('Введите имя пользователя');
        return;
    }
    
    if (username.length < 2) {
        showError('Имя должно быть не менее 2 символов');
        return;
    }
    
    hideError();
    
    const authButton = document.getElementById('auth-button');
    authButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Подключение...';
    authButton.disabled = true;
    
    socket.emit('login', { username: username });
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

function showChatScreen() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('chat-screen').classList.add('active');
    
    document.getElementById('current-user').textContent = currentUser.username;
    updateUserAvatar();
}

function updateUserAvatar() {
    const avatar = document.getElementById('user-avatar');
    const profileAvatar = document.getElementById('profile-avatar');
    if (currentUser.avatar) {
        avatar.src = currentUser.avatar;
        if (profileAvatar) profileAvatar.src = currentUser.avatar;
    }
}

function updateOnlineCount() {
    const onlineCount = allUsers.filter(user => user.isOnline).length;
    const countElement = document.getElementById('online-count');
    if (countElement) {
        countElement.textContent = `${onlineCount} онлайн`;
    }
}

function updateFriendsStats() {
    const onlineFriends = friends.filter(f => f.isOnline).length;
    document.getElementById('friends-online').textContent = onlineFriends;
    document.getElementById('friends-total').textContent = friends.length;
    document.getElementById('stat-friends').textContent = friends.length;
    document.getElementById('stat-online').textContent = onlineFriends;
}

// Система вкладок
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    if (tabName === 'requests') {
        refreshRequests();
    }
}

function renderFriendsList() {
    const friendsList = document.getElementById('friends-list');
    if (!friendsList) return;
    
    if (friends.length === 0) {
        friendsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>У вас пока нет друзей</p>
                <button class="btn-secondary" onclick="showTab('search')" style="margin-top: 1rem;">
                    Найти друзей
                </button>
            </div>
        `;
        return;
    }
    
    friendsList.innerHTML = friends.map(friend => `
        <div class="friend-item" onclick="selectUserChat('${friend.id}')">
            <img src="${friend.avatar}" class="avatar">
            <div class="friend-info">
                <div class="friend-name">${friend.username}</div>
                <div class="friend-status ${friend.isOnline ? 'online' : 'offline'}">
                    ${friend.isOnline ? 'В сети' : `Был(а) ${formatLastSeen(friend.lastSeen)}`}
                </div>
            </div>
            <div class="status-indicator ${friend.isOnline ? 'online' : 'offline'}"></div>
        </div>
    `).join('');
    
    updateFriendsStats();
}

function renderSearchResults(results) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) return;
    
    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Ничего не найдено</p>
            </div>
        `;
        return;
    }
    
    searchResults.innerHTML = results.map(user => `
        <div class="search-item">
            <img src="${user.avatar}" class="avatar">
            <div class="search-info">
                <div class="search-name">${user.username}</div>
                <div class="search-status ${user.isOnline ? 'online' : 'offline'}">
                    ${user.isOnline ? 'В сети' : 'Не в сети'}
                </div>
            </div>
            <div class="search-actions">
                ${user.isFriend ? 
                    '<span class="friend-badge">Друг</span>' :
                    user.hasPendingRequest ?
                    '<span class="pending-badge">Запрос отправлен</span>' :
                    `<button class="btn-primary btn-small" onclick="addFriend('${user.id}')">
                        <i class="fas fa-user-plus"></i> Добавить
                    </button>`
                }
            </div>
        </div>
    `).join('');
}

function renderPendingRequests(requests) {
    const requestsList = document.getElementById('requests-list');
    if (!requestsList) return;
    
    if (requests.length === 0) {
        requestsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-clock"></i>
                <p>Нет заявок в друзья</p>
            </div>
        `;
        return;
    }
    
    requestsList.innerHTML = requests.map(request => `
        <div class="request-item">
            <img src="${request.user.avatar}" class="avatar">
            <div class="request-info">
                <div class="request-name">${request.user.username}</div>
                <div class="request-time">${formatTime(request.friendship.createdAt)}</div>
            </div>
            <div class="request-actions">
                <button class="btn-success btn-small" onclick="acceptFriend('${request.friendship.id}')">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-danger btn-small" onclick="rejectFriend('${request.friendship.id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Поиск пользователей
function searchUsers() {
    const searchTerm = document.getElementById('global-search').value.trim();
    
    if (searchTerm.length < 2) {
        document.getElementById('search-results').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Введите минимум 2 символа</p>
            </div>
        `;
        return;
    }
    
    socket.emit('searchUsers', searchTerm);
}

// Работа с друзьями
function addFriend(friendId) {
    socket.emit('addFriend', friendId);
}

function acceptFriend(friendshipId) {
    socket.emit('acceptFriend', friendshipId);
}

function rejectFriend(friendshipId) {
    socket.emit('rejectFriend', friendshipId);
}

function refreshRequests() {
    socket.emit('getPendingRequests');
}

// Выбор чатов
function selectUserChat(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    selectedChat = {
        type: 'user',
        id: userId,
        name: user.username,
        avatar: user.avatar
    };
    
    showChat();
}

function showChat() {
    if (!selectedChat) return;
    
    document.getElementById('selected-chat-name').textContent = selectedChat.name;
    document.getElementById('chat-avatar').src = selectedChat.avatar;
    
    const user = allUsers.find(u => u.id === selectedChat.id);
    updateChatStatus(user);
    
    document.getElementById('message-input-area').style.display = 'flex';
    displayChatHistory();
}

function updateChatStatus(user) {
    const statusElement = document.getElementById('chat-status');
    if (user.isOnline) {
        statusElement.textContent = 'В сети';
        statusElement.className = 'status online';
    } else {
        statusElement.textContent = `Был(а) ${formatLastSeen(user.lastSeen)}`;
        statusElement.className = 'status offline';
    }
}

function displayChatHistory() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    
    const chatMessages = allMessages.filter(msg => 
        (msg.senderId === currentUser.id && msg.receiverId === selectedChat.id) ||
        (msg.senderId === selectedChat.id && msg.receiverId === currentUser.id)
    );
    
    chatMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (chatMessages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h3>Начало переписки с ${selectedChat.name}</h3>
                <p>Напишите первое сообщение!</p>
            </div>
        `;
        return;
    }
    
    chatMessages.forEach(message => displayMessage(message));
    container.scrollTop = container.scrollHeight;
}

function displayMessage(message) {
    const container = document.getElementById('messages-container');
    
    const welcomeMessage = container.querySelector('.welcome-message');
    if (welcomeMessage) {
        container.innerHTML = '';
    }
    
    const messageElement = document.createElement('div');
    const isOwnMessage = message.senderId === currentUser.id;
    
    messageElement.className = `message ${isOwnMessage ? 'own' : 'other'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', minute: '2-digit' 
    });
    
    messageElement.innerHTML = `
        <div class="message-text">${message.text}</div>
        <div class="message-time">${time}</div>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

// Отправка сообщений
function sendMessage() {
    if (!selectedChat) {
        showNotification('Выберите друга для отправки сообщения', 'warning');
        return;
    }
    
    const textInput = document.getElementById('message-text');
    const text = textInput.value.trim();
    
    if (!text) return;
    
    const messageData = {
        text: text,
        type: 'text',
        receiverId: selectedChat.id
    };
    
    socket.emit('sendMessage', messageData);
    textInput.value = '';
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Эмодзи
function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function addEmoji(emoji) {
    const textInput = document.getElementById('message-text');
    textInput.value += emoji;
    textInput.focus();
    toggleEmojiPicker();
}

// Уведомления
function showNotification(message, type = 'info') {
    const toast = document.getElementById('notification-toast');
    const bgColor = type === 'error' ? '#f56565' : 
                   type === 'success' ? '#48bb78' : 
                   type === 'warning' ? '#ed8936' : 
                   '#667eea';
    
    toast.innerHTML = `
        <div style="border-left-color: ${bgColor}">
            <div style="font-weight: 600; margin-bottom: 0.25rem;">Quantum</div>
            <div>${message}</div>
        </div>
    `;
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function showNotifications() {
    showModal('notifications-modal');
}

function updateNotificationBadge() {
    const unreadCount = notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notification-badge');
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Профиль и настройки
function showProfile() {
    if (!currentUser) return;
    
    document.getElementById('profile-username').value = currentUser.username;
    document.getElementById('profile-email').value = currentUser.email || '';
    document.getElementById('profile-bio').value = currentUser.bio || '';
    document.getElementById('profile-language').value = currentUser.language || 'ru';
    document.getElementById('profile-timezone').value = currentUser.timezone || 'Europe/Moscow';
    
    document.getElementById('profile-joined').textContent = formatDate(currentUser.createdAt);
    document.getElementById('profile-last-active').textContent = formatDate(currentUser.lastActive);
    document.getElementById('stat-messages').textContent = allMessages.filter(m => 
        m.senderId === currentUser.id
    ).length;
    
    showModal('profile-modal');
}

function saveProfile() {
    const profileData = {
        username: document.getElementById('profile-username').value,
        email: document.getElementById('profile-email').value,
        bio: document.getElementById('profile-bio').value,
        language: document.getElementById('profile-language').value,
        timezone: document.getElementById('profile-timezone').value
    };
    
    socket.emit('updateProfile', profileData);
    closeModal();
    showNotification('Профиль успешно обновлен', 'success');
}

function changeAvatar() {
    const avatars = [
        'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.username) + '&background=667eea&color=fff&bold=true',
        'https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.username,
        'https://api.dicebear.com/7.x/micah/svg?seed=' + currentUser.username
    ];
    
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
    currentUser.avatar = randomAvatar;
    updateUserAvatar();
    showNotification('Аватар обновлен', 'success');
}

function randomAvatar() {
    changeAvatar();
}

// Статусы
function updateStatus(status) {
    socket.emit('updateStatus', status);
    showNotification(`Статус изменен на: ${getStatusText(status)}`, 'success');
    closeAllDropdowns();
}

function getStatusText(status) {
    const statusMap = {
        'online': 'В сети',
        'away': 'Отошел',
        'dnd': 'Не беспокоить',
        'offline': 'Не в сети'
    };
    return statusMap[status] || status;
}

// Модальные окна
function showModal(modalId) {
    document.getElementById('modal-overlay').style.display = 'flex';
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    document.getElementById(modalId).style.display = 'block';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

function showStats() {
    fetch('/api/stats')
        .then(response => response.json())
        .then(stats => {
            document.getElementById('stats-total-users').textContent = stats.totalUsers;
            document.getElementById('stats-online-users').textContent = stats.onlineUsers;
            document.getElementById('stats-total-messages').textContent = stats.totalMessages;
            showModal('stats-modal');
        });
}

// Вспомогательные функции
function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'давно';
    
    const now = new Date();
    const seen = new Date(lastSeen);
    const diffMinutes = Math.floor((now - seen) / (1000 * 60));
    
    if (diffMinutes < 1) return 'только что';
    if (diffMinutes < 60) return `${diffMinutes} мин назад`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} ч назад`;
    return `${Math.floor(diffMinutes / 1440)} дн назад`;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('show');
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.remove('show');
    });
}

function startNewChat() {
    showTab('search');
}

function showChatInfo() {
    if (!selectedChat) {
        showNotification('Выберите чат', 'warning');
        return;
    }
    
    showNotification(`Чат с ${selectedChat.name}`, 'info');
}

function clearChat() {
    if (!selectedChat) return;
    
    if (confirm('Очистить историю переписки?')) {
        const container = document.getElementById('messages-container');
        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h3>История очищена</h3>
                <p>Начните общение заново!</p>
            </div>
        `;
    }
}

function logout() {
    if (confirm('Выйти из аккаунта?')) {
        currentUser = null;
        selectedChat = null;
        allMessages = [];
        allUsers = [];
        friends = [];
        notifications = [];
        
        document.getElementById('chat-screen').classList.remove('active');
        document.getElementById('auth-screen').classList.add('active');
        
        document.getElementById('username').value = '';
        document.getElementById('auth-button').innerHTML = '<i class="fas fa-rocket"></i> Начать общение';
        document.getElementById('auth-button').disabled = false;
        
        if (socket) {
            socket.disconnect();
        }
    }
}

