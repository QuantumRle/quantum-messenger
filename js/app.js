let socket;
let currentUser = null;
let selectedChat = null;
let allMessages = [];
let allUsers = [];
let friends = [];
let groups = [];
let notifications = [];

const BACKEND_URL = 'https://quantum-backend-yi39.onrender.com';

// Эмодзи для реакций
const EMOJIS = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '❤️', '👍', '👎', '🔥', '⭐', '🎉', '🙏', '💯', '👏', '🙌'];

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
        showNotification('Подключено к серверу', 'success');
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        showError('Ошибка подключения к серверу');
        showNotification('Ошибка подключения', 'error');
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
        renderUsersList();
    });
    
    socket.on('friendsList', (friendsList) => {
        console.log('🤝 Friends list:', friendsList.length);
        friends = friendsList;
        renderFriendsList();
        renderGroupsTab();
    });
    
    socket.on('groupsList', (groupsList) => {
        console.log('👥 Groups list:', groupsList.length);
        groups = groupsList;
        renderGroupsList();
    });
    
    socket.on('newMessage', (message) => {
        console.log('💬 New message:', message);
        allMessages.push(message);
        
        if (selectedChat && (
            (selectedChat.type === 'user' && selectedChat.id === message.senderId) ||
            (selectedChat.type === 'group' && selectedChat.id === message.groupId)
        )) {
            displayMessage(message);
        } else {
            // Показать уведомление о новом сообщении
            if (message.senderId !== currentUser.id) {
                showNotification(`Новое сообщение от ${message.senderName}`, 'info');
            }
        }
        
        updateChatsList();
    });
    
    socket.on('messageHistory', (messages) => {
        console.log('📨 Message history:', messages.length);
        allMessages = messages;
        if (selectedChat) {
            displayChatHistory();
        }
    });
    
    socket.on('messageUpdated', (message) => {
        const index = allMessages.findIndex(m => m.id === message.id);
        if (index > -1) {
            allMessages[index] = message;
            if (selectedChat) {
                displayChatHistory();
            }
        }
    });
    
    socket.on('searchResults', (results) => {
        renderSearchResults(results);
    });
    
    socket.on('friendRequest', (data) => {
        console.log('📩 Friend request from:', data.from.username);
        showNotification(`${data.from.username} отправил запрос в друзья`, 'info');
        renderFriendsList();
    });
    
    socket.on('friendRequestSent', (friend) => {
        showNotification(`Запрос в друзья отправлен ${friend.username}`, 'success');
    });
    
    socket.on('friendAccepted', (friend) => {
        console.log('✅ Friend accepted:', friend.username);
        showNotification(`${friend.username} принял вашу заявку в друзья`, 'success');
        renderFriendsList();
    });
    
    socket.on('groupCreated', (group) => {
        console.log('👥 Group created:', group.name);
        groups.push(group);
        renderGroupsList();
        showNotification(`Вы добавлены в группу "${group.name}"`, 'success');
    });
    
    socket.on('userStatusUpdate', (user) => {
        const index = allUsers.findIndex(u => u.id === user.id);
        if (index > -1) {
            allUsers[index] = user;
        }
        updateOnlineCount();
        renderUsersList();
        renderFriendsList();
        
        if (selectedChat && selectedChat.type === 'user' && selectedChat.id === user.id) {
            updateChatStatus(user);
        }
    });
    
    socket.on('newNotification', (notification) => {
        console.log('🔔 New notification:', notification);
        notifications.push(notification);
        updateNotificationBadge();
        showNotification(notification.message, 'info');
    });
    
    // Настройка кнопок
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('auth-button').addEventListener('click', handleAuth);
    document.getElementById('username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
    });
    
    // Закрытие dropdown при клике вне его
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
    
    // Показываем загрузку
    const authButton = document.getElementById('auth-button');
    authButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Подключение...';
    authButton.disabled = true;
    
    // Простой вход - работает всегда
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
    console.log('🔄 Showing chat screen');
    
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('chat-screen').classList.add('active');
    
    document.getElementById('current-user').textContent = currentUser.username;
    updateUserAvatar();
}

function updateUserAvatar() {
    const avatar = document.getElementById('user-avatar');
    if (currentUser.avatar) {
        avatar.src = currentUser.avatar;
    }
}

function updateOnlineCount() {
    const onlineCount = allUsers.filter(user => user.isOnline).length;
    const countElement = document.getElementById('online-count');
    if (countElement) {
        countElement.textContent = `${onlineCount} онлайн`;
    }
}

// Система вкладок
function showTab(tabName) {
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Показываем выбранную вкладку
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Загружаем данные для вкладки
    switch(tabName) {
        case 'friends':
            socket.emit('getFriends');
            break;
        case 'groups':
            socket.emit('getGroups');
            break;
        case 'chats':
            updateChatsList();
            break;
    }
}

// Рендеринг списков
function renderUsersList() {
    // Эта функция будет обновлять список в поиске
}

function renderFriendsList() {
    const friendsList = document.getElementById('friends-list');
    if (!friendsList) return;
    
    if (friends.length === 0) {
        friendsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>У вас пока нет друзей</p>
                <button class="btn-secondary" onclick="showAddFriend()" style="margin-top: 1rem;">
                    Найти друзей
                </button>
            </div>
        `;
        return;
    }
    
    friendsList.innerHTML = friends.map(friend => `
        <div class="friend-item" onclick="selectUserChat('${friend.id}')">
            <img src="${friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=667eea&color=fff`}" class="avatar">
            <div class="friend-info">
                <div class="friend-name">${friend.username}</div>
                <div class="friend-status ${friend.isOnline ? 'online' : 'offline'}">
                    ${friend.isOnline ? 'В сети' : `Был(а) ${formatLastSeen(friend.lastSeen)}`}
                </div>
            </div>
            <div class="status-indicator ${friend.isOnline ? 'online' : 'offline'}"></div>
        </div>
    `).join('');
}

function renderGroupsList() {
    const groupsList = document.getElementById('groups-list');
    if (!groupsList) return;
    
    if (groups.length === 0) {
        groupsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-layer-group"></i>
                <p>У вас пока нет групп</p>
                <button class="btn-secondary" onclick="showCreateGroup()" style="margin-top: 1rem;">
                    Создать группу
                </button>
            </div>
        `;
        return;
    }
    
    groupsList.innerHTML = groups.map(group => `
        <div class="group-item" onclick="selectGroupChat('${group.id}')">
            <img src="${group.avatar}" class="avatar">
            <div class="group-info">
                <div class="group-name">${group.name}</div>
                <div class="group-members">${group.members.length} участников</div>
            </div>
        </div>
    `).join('');
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
            <img src="${user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=667eea&color=fff`}" class="avatar">
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
function showAddFriend() {
    // Просто переключаем на вкладку поиска
    showTab('search');
    document.getElementById('global-search').focus();
}

function addFriend(friendId) {
    socket.emit('addFriend', friendId);
}

// Работа с группами
function showCreateGroup() {
    // В упрощенной версии создаем группу сразу
    const groupName = prompt('Введите название группы:');
    if (groupName && groupName.trim()) {
        createGroup(groupName.trim());
    }
}

function createGroup(groupName) {
    // В упрощенной версии создаем группу только с текущим пользователем
    socket.emit('createGroup', {
        name: groupName,
        members: [], // Только создатель
        description: ''
    });
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

function selectGroupChat(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    selectedChat = {
        type: 'group',
        id: groupId,
        name: group.name,
        avatar: group.avatar
    };
    
    showChat();
}

function showChat() {
    if (!selectedChat) return;
    
    // Обновляем заголовок чата
    document.getElementById('selected-chat-name').textContent = selectedChat.name;
    document.getElementById('chat-avatar').src = selectedChat.avatar;
    
    // Обновляем статус
    if (selectedChat.type === 'user') {
        const user = allUsers.find(u => u.id === selectedChat.id);
        updateChatStatus(user);
    } else {
        document.getElementById('chat-status').textContent = 'Групповой чат';
        document.getElementById('chat-status').className = 'status';
    }
    
    // Показываем поле ввода
    document.getElementById('message-input-area').style.display = 'flex';
    
    // Показываем историю сообщений
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
    
    let chatMessages = [];
    
    if (selectedChat.type === 'user') {
        chatMessages = allMessages.filter(msg => 
            (msg.senderId === currentUser.id && msg.receiverId === selectedChat.id) ||
            (msg.senderId === selectedChat.id && msg.receiverId === currentUser.id)
        );
    } else {
        chatMessages = allMessages.filter(msg => msg.groupId === selectedChat.id);
    }
    
    // Сортируем по времени
    chatMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (chatMessages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h3>Начало переписки</h3>
                <p>Напишите первое сообщение!</p>
            </div>
        `;
        return;
    }
    
    chatMessages.forEach(message => displayMessage(message));
    
    // Прокручиваем вниз
    container.scrollTop = container.scrollHeight;
}

function displayMessage(message) {
    const container = document.getElementById('messages-container');
    
    // Убираем welcome сообщение если есть
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
    
    let messageHTML = '';
    
    if (message.type === 'system') {
        messageElement.className = 'message-system';
        messageHTML = `<div class="message-text">${message.text}</div>`;
    } else {
        messageHTML = `
            ${!isOwnMessage && selectedChat.type === 'group' ? 
                `<div class="message-sender">${message.senderName}</div>` : ''}
            <div class="message-text">${message.text}</div>
            ${message.reactions && message.reactions.length > 0 ? `
                <div class="message-reactions">
                    ${message.reactions.map(reaction => 
                        `<span class="reaction" onclick="toggleReaction('${message.id}', '${reaction.emoji}')">
                            ${reaction.emoji} ${reaction.count || ''}
                        </span>`
                    ).join('')}
                </div>
            ` : ''}
            <div class="message-time">${time}</div>
        `;
    }
    
    messageElement.innerHTML = messageHTML;
    messageElement.onclick = (e) => {
        if (e.target.classList.contains('message-text')) {
            showMessageActions(message.id);
        }
    };
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

// Отправка сообщений
function sendMessage() {
    if (!selectedChat) {
        showNotification('Выберите чат для отправки сообщения', 'warning');
        return;
    }
    
    const textInput = document.getElementById('message-text');
    const text = textInput.value.trim();
    
    if (!text) return;
    
    const messageData = {
        text: text,
        type: 'text'
    };
    
    if (selectedChat.type === 'user') {
        messageData.receiverId = selectedChat.id;
    } else {
        messageData.groupId = selectedChat.id;
    }
    
    socket.emit('sendMessage', messageData);
    textInput.value = '';
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Реакции на сообщения
function toggleReaction(messageId, emoji) {
    socket.emit('addReaction', {
        messageId: messageId,
        emoji: emoji
    });
}

function showMessageActions(messageId) {
    // В упрощенной версии просто показываем быстрые реакции
    const quickReactions = ['👍', '❤️', '😂', '😮', '😢'];
    showNotification('Нажмите на эмодзи для реакции', 'info');
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

// Файлы (упрощенная версия)
function triggerFileUpload() {
    document.getElementById('file-upload').click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 40 * 1024 * 1024) { // 40MB
        showNotification('Файл слишком большой (максимум 40MB)', 'error');
        return;
    }
    
    // В реальном приложении здесь была бы загрузка файла
    showNotification(`Файл "${file.name}" готов к отправке`, 'info');
    
    if (selectedChat) {
        const textInput = document.getElementById('message-text');
        textInput.value = `[Файл: ${file.name}]`;
    }
}

// Уведомления
function showNotification(message, type = 'info') {
    const toast = document.getElementById('notification-toast');
    const bgColor = type === 'error' ? 'var(--error-color)' : 
                   type === 'success' ? 'var(--success-color)' : 
                   type === 'warning' ? 'var(--warning-color)' : 
                   'var(--primary-color)';
    
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

function toggleNotifications() {
    // В упрощенной версии просто показываем уведомление
    showNotification('Уведомления работают в реальном времени', 'info');
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

function updateChatsList() {
    // В упрощенной версии не реализовано
}

function startNewChat() {
    showTab('search');
}

function showChatInfo() {
    if (!selectedChat) {
        showNotification('Выберите чат', 'warning');
        return;
    }
    
    const info = selectedChat.type === 'user' ? 
        `Личная переписка с ${selectedChat.name}` :
        `Группа: ${selectedChat.name}`;
    
    showNotification(info, 'info');
}

function logout() {
    if (confirm('Выйти из аккаунта?')) {
        currentUser = null;
        selectedChat = null;
        allMessages = [];
        allUsers = [];
        friends = [];
        groups = [];
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

// Инициализация при загрузке
console.log('🚀 Quantum Messenger initialized');
