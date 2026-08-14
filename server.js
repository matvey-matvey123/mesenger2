const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'public', 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'public', 'messages.json');
const JWT_SECRET = 'your-secret-key-change-this';

app.use(express.json());
app.use(express.static('public'));

// Инициализация файлов
async function initFiles() {
    try {
        await fs.access(USERS_FILE);
    } catch {
        await fs.writeFile(USERS_FILE, '[]');
    }
    try {
        await fs.access(MESSAGES_FILE);
    } catch {
        await fs.writeFile(MESSAGES_FILE, '[]');
    }
}

// Чтение пользователей
async function readUsers() {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

// Запись пользователей
async function writeUsers(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

// Чтение сообщений
async function readMessages() {
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    return JSON.parse(data);
}

// Запись сообщений
async function writeMessages(messages) {
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }

        const users = await readUsers();
        
        // Проверка на существование пользователя
        if (users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            avatar: `https://ui-avatars.com/api/?name=${username}&background=random`,
            online: false,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        await writeUsers(users);

        const token = jwt.sign({ userId: newUser.id }, JWT_SECRET);
        res.json({ token, user: { ...newUser, password: undefined } });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readUsers();
        const user = users.find(u => u.username === username || u.email === username);

        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET);
        res.json({ token, user: { ...user, password: undefined } });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение списка пользователей
app.get('/api/users', async (req, res) => {
    try {
        const users = await readUsers();
        const safeUsers = users.map(({ password, ...user }) => user);
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Поиск пользователей
app.get('/api/users/search', async (req, res) => {
    try {
        const { query } = req.query;
        const users = await readUsers();
        const filtered = users.filter(u => 
            u.username.toLowerCase().includes(query.toLowerCase()) ||
            u.email.toLowerCase().includes(query.toLowerCase())
        );
        const safeUsers = filtered.map(({ password, ...user }) => user);
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Socket.io для реального времени
io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('user-online', async (userId) => {
        const users = await readUsers();
        const user = users.find(u => u.id === userId);
        if (user) {
            user.online = true;
            await writeUsers(users);
            io.emit('users-updated', users.map(({ password, ...u }) => u));
        }
    });

    socket.on('user-offline', async (userId) => {
        const users = await readUsers();
        const user = users.find(u => u.id === userId);
        if (user) {
            user.online = false;
            await writeUsers(users);
            io.emit('users-updated', users.map(({ password, ...u }) => u));
        }
    });

    socket.on('send-message', async (messageData) => {
        const messages = await readMessages();
        const newMessage = {
            id: Date.now().toString(),
            ...messageData,
            timestamp: new Date().toISOString()
        };
        messages.push(newMessage);
        await writeMessages(messages);
        io.emit('new-message', newMessage);
    });

    socket.on('get-messages', async ({ userId, otherUserId }) => {
        const messages = await readMessages();
        const filtered = messages.filter(m => 
            (m.senderId === userId && m.receiverId === otherUserId) ||
            (m.senderId === otherUserId && m.receiverId === userId)
        );
        socket.emit('messages-history', filtered);
    });

    socket.on('disconnect', () => {
        console.log('Отключение:', socket.id);
    });
});

initFiles().then(() => {
    server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT}`);
    });
});
