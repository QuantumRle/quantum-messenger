let socket;
let currentUser = null;
let selectedChat = null;
let allMessages = [];
let allUsers = [];
let friends = [];
let notifications = [];

const BACKEND_URL = 'http://messengerapp.free.nf';

// Проверяем сессию при загрузке
const savedToken = localStorage.getItem('quantum_token');
if (savedToken) {
    verifySession(savedToken);
}

async function verifySession(token) {
    try {
        const response = await fetch(BACKEND_URL + '/api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'verify_session',
                token: token
            })
        });
        const result = await response.json();
        
        if (result.success) {
            currentUser = result.user;
            initializeApp();
        } else {
            localStorage.removeItem('quantum_token');
        }
    } catch (error) {
        console.error('Session verification failed:', error);
    }
}

function initializeApp() {
    console.log('🌌 Quantum Messenger started');
    
    // Показываем экран чата
    showChatScreen();
    
    // Загружаем данные
    loadUsers();
    loadFriends();
}

function showChatScreen() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('chat-screen').classList.add('active');
    
    if (currentUser) {
        const userElement = document.getElementById('current-user');
        if (userElement) {
            userElement.textContent = currentUser.username;
        }
        
        // Обновляем аватар
        const avatarElement = document.getElementById('user-avatar');
        if (avatarElement && currentUser.avatar) {
            avatarElement.src = currentUser.avatar;
        }
    }
}

async function loadUsers() {
    try {
        const response = await fetch(BACKEND_URL + '/api.php?action=get_users');
        const result = await response.json();
        
        if (result.success) {
            allUsers = result.users;
            updateOnlineCount();
            renderUsersList();
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function loadFriends() {
    // В упрощенной версии считаем всех пользователей друзьями
    friends = allUsers.filter(user => user.id !== currentUser.id);
    renderFriendsList();
}

function updateOnlineCount() {
    const onlineCount = allUsers.filter(user => user.is_online).length;
    const countElement = document.getElementById('online-count');
    if (countElement) {
        countElement.textContent = `${onlineCount} онлайн`;
    }
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
            <img src="${friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=667eea&color=fff`}" class="avatar">
            <div class="friend-info">
                <div class="friend-name">${friend.username}</div>
                <div class="friend-status ${friend.is_online ? 'online' : 'offline'}">
                    ${friend.is_online ? 'В сети' : `Был(а) ${formatLastSeen(friend.last_seen)}`}
                </div>
            </div>
            <div class="status-indicator ${friend.is_online ? 'online' : 'offline'}"></div>
        </div>
    `).join('');
}

function renderUsersList() {
    // Для поиска пользователей
}

async function searchUsers() {
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
    
    // Фильтруем пользователей по имени
    const results = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) &&
        user.id !== currentUser.id
    );
    
    renderSearchResults(results);
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
                <div class="search-status ${user.is_online ? 'online' : 'offline'}">
                    ${user.is_online ? 'В сети' : 'Не в сети'}
                </div>
            </div>
            <div class="search-actions">
                <button class="btn-primary btn-small" onclick="addFriend('${user.id}')">
                    <i class="fas fa-user-plus"></i> Добавить
                </button>
            </div>
        </div>
    `).join('');
}

async function addFriend(friendId) {
    try {
        const response = await fetch(BACKEND_URL + '/api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'add_friend',
                token: localStorage.getItem('quantum_token'),
                friend_id: friendId
            })
        });
        const result = await response.json();
        
        if (result.success) {
            showNotification('Запрос в друзья отправлен', 'success');
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error adding friend:', error);
        showNotification('Ошибка отправки запроса', 'error');
    }
}

// Выбор чата
function selectUserChat(userId) {
    const user = allUsers.find(u => u.id == userId);
    if (!user) return;
    
    selectedChat = {
        type: 'user',
        id: userId,
        name: user.username,
        avatar: user.avatar
    };
    
    showChat();
    loadChatHistory(userId);
}

async function loadChatHistory(otherUserId) {
    try {
        const response = await fetch(BACKEND_URL + '/api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'get_messages',
                token: localStorage.getItem('quantum_token'),
                other_user_id: otherUserId
            })
        });
        const result = await response.json();
        
        if (result.success) {
            displayChatHistory(result.messages);
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

function showChat() {
    if (!selectedChat) return;
    
    document.getElementById('selected-chat-name').textContent = selectedChat.name;
    const chatAvatar = document.getElementById('chat-avatar');
    if (chatAvatar) {
        chatAvatar.src = selectedChat.avatar;
    }
    
    const user = allUsers.find(u => u.id == selectedChat.id);
    updateChatStatus(user);
    
    document.getElementById('message-input-area').style.display = 'flex';
}

function updateChatStatus(user) {
    const statusElement = document.getElementById('chat-status');
    if (!statusElement) return;
    
    if (user.is_online) {
        statusElement.textContent = 'В сети';
        statusElement.className = 'status online';
    } else {
        statusElement.textContent = `Был(а) ${formatLastSeen(user.last_seen)}`;
        statusElement.className = 'status offline';
    }
}

function displayChatHistory(messages) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (messages.length === 0) {
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
    
    messages.forEach(message => displayMessage(message));
    container.scrollTop = container.scrollHeight;
}

function displayMessage(message) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    // Убираем welcome сообщение если есть
    const welcomeMessage = container.querySelector('.welcome-message');
    if (welcomeMessage) {
        container.innerHTML = '';
    }
    
    const messageElement = document.createElement('div');
    const isOwnMessage = message.sender_id == currentUser.id;
    
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
async function sendMessage() {
    if (!selectedChat) {
        showNotification('Выберите друга для отправки сообщения', 'warning');
        return;
    }
    
    const textInput = document.getElementById('message-text');
    const text = textInput.value.trim();
    
    if (!text) return;
    
    try {
        const response = await fetch(BACKEND_URL + '/api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'send_message',
                token: localStorage.getItem('quantum_token'),
                receiver_id: selectedChat.id,
                text: text
            })
        });
        const result = await response.json();
        
        if (result.success) {
            // Добавляем сообщение в историю
            const newMessage = {
                id: result.message_id,
                sender_id: currentUser.id,
                sender_name: currentUser.username,
                receiver_id: selectedChat.id,
                text: text,
                timestamp: new Date()
            };
            
            displayMessage(newMessage);
            textInput.value = '';
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Уведомления
function showNotification(message, type = 'info') {
    const toast = document.getElementById('notification-toast');
    if (!toast) return;
    
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

function logout() {
    localStorage.removeItem('quantum_token');
    currentUser = null;
    selectedChat = null;
    
    document.getElementById('chat-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
    
    showNotification('Вы вышли из системы', 'info');
}

// Делаем функции глобальными
window.showTab = showTab;
window.searchUsers = searchUsers;
window.addFriend = addFriend;
window.selectUserChat = selectUserChat;
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.logout = logout;
window.startNewChat = () => showTab('search');
