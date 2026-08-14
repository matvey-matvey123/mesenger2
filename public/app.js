let currentUser = null;
let selectedUser = null;
let socket = null;
let allUsers = [];

// Инициализация Socket.io
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Подключено к серверу');
        if (currentUser) {
            socket.emit('user-online', currentUser.id);
        }
    });
    
    socket.on('users-updated', (users) => {
        allUsers = users.filter(u => u.id !== currentUser?.id);
        displayUsers(allUsers);
    });
    
    socket.on('new-message', (message) => {
        if (selectedUser && 
            ((message.senderId === currentUser.id && message.receiverId === selectedUser.id) ||
             (message.senderId === selectedUser.id && message.receiverId === currentUser.id))) {
            addMessageToChat(message);
        }
    });
    
    socket.on('messages-history', (messages) => {
        displayMessages(messages);
    });
}

// Показать форму входа
function showLogin() {
    document.getElementById('login-form').style.display = 'flex';
    document.getElementById('register-form').style.display = 'none';
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.querySelectorAll('.tab-btn')[1].classList.remove('active');
}

// Показать форму регистрации
function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'flex';
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.querySelectorAll('.tab-btn')[0].classList.remove('active');
}

// Обработка входа
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('token', data.token);
            showMainScreen();
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Ошибка соединения с сервером');
    }
});

// Обработка регистрации
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    if (password !== confirmPassword) {
        showError('Пароли не совпадают');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('token', data.token);
            showMainScreen();
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Ошибка соединения с сервером');
    }
});

// Показать ошибку
function showError(message) {
    const errorElement = document.getElementById('auth-error');
    errorElement.textContent = message;
    setTimeout(() => {
        errorElement.textContent = '';
    }, 3000);
}

// Показать главный экран
function showMainScreen() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'flex';
    
    document.getElementById('current-user-name').textContent = currentUser.username;
    document.getElementById('current-user-avatar').src = currentUser.avatar;
    
    initSocket();
    loadUsers();
}

// Загрузить пользователей
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        allUsers = users.filter(u => u.id !== currentUser.id);
        displayUsers(allUsers);
        socket.emit('user-online', currentUser.id);
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

// Отобразить пользователей
function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        if (selectedUser && selectedUser.id === user.id) {
            userElement.classList.add('active');
        }
        
        userElement.innerHTML = `
            <img src="${user.avatar}" alt="Avatar" class="avatar">
            <div class="user-item-info">
                <div class="user-item-name">${user.username}</div>
                <div class="user-item-email">${user.email}</div>
            </div>
            <div class="${user.online ? 'online-indicator' : 'offline-indicator'}"></div>
        `;
        
        userElement.addEventListener('click', () => selectUser(user));
        usersList.appendChild(userElement);
    });
}

// Выбрать пользователя
function selectUser(user) {
    selectedUser = user;
    displayUsers(allUsers);
    
    document.getElementById('chat-username').textContent = user.username;
    document.getElementById('chat-avatar').src = user.avatar;
    document.getElementById('chat-status').textContent = user.online ? 'Онлайн' : 'Офлайн';
    
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    
    // Загрузить историю сообщений
    socket.emit('get-messages', {
        userId: currentUser.id,
        otherUserId: user.id
    });
}

// Отправить сообщение
function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const messageText = messageInput.value.trim();
    
    if (!messageText || !selectedUser) return;
    
    const messageData = {
        senderId: currentUser.id,
        receiverId: selectedUser.id,
        text: messageText
    };
    
    socket.emit('send-message', messageData);
    messageInput.value = '';
}

// Добавить сообщение в чат
function addMessageToChat(message) {
    const messagesContainer = document.getElementById('messages-container');
    
    // Удалить "Выберите пользователя" если есть
    const noChat = messagesContainer.querySelector('.no-chat-selected');
    if (noChat) {
        noChat.remove();
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageElement.innerHTML = `
        ${message.text}
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Отобразить историю сообщений
function displayMessages(messages) {
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<div class="no-chat-selected">Нет сообщений</div>';
        return;
    }
    
    messages.forEach(message => {
        addMessageToChat(message);
    });
}

// Выйти из системы
function logout() {
    if (currentUser && socket) {
        socket.emit('user-offline', currentUser.id);
    }
    
    localStorage.removeItem('token');
    currentUser = null;
    selectedUser = null;
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    
    // Очистить формы
    document.getElementById('login-form').reset();
    document.getElementById('register-form').reset();
    document.getElementById('message-input').value = '';
    document.getElementById('message-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('messages-container').innerHTML = '<div class="no-chat-selected">Выберите пользователя для начала общения</div>';
    document.getElementById('chat-username').textContent = 'Выберите пользователя';
    document.getElementById('chat-avatar').src = '';
    document.getElementById('chat-status').textContent = '';
}

// Поиск пользователей
document.getElementById('search-input').addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    
    if (query) {
        try {
            const response = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            const users = await response.json();
            const filtered = users.filter(u => u.id !== currentUser.id);
            displayUsers(filtered);
        } catch (error) {
            console.error('Ошибка поиска:', error);
        }
    } else {
        displayUsers(allUsers);
    }
});

// Отправка сообщения по Enter
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Проверка токена при загрузке
window.addEventListener('load', () => {
    const token = localStorage.getItem('token');
    // Здесь можно добавить проверку токена на сервере
});
