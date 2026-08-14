const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'public', 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'public', 'messages.json');
const JWT_SECRET = 'your-secret-key-change-this';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Инициализация файлов
async function initFiles() {
    try {
        await fs.access(USERS_FILE);
    } catch {
        await fs.writeFile(USERS_FILE, '[]');
        console.log('Создан файл users.json');
    }
    try {
        await fs.access(MESSAGES_FILE);
    } catch {
        await fs.writeFile(MESSAGES_FILE, '[]');
        console.log('Создан файл messages.json');
    }
}

// Чтение пользователей
async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (error) {
        console.error('Ошибка чтения пользователей:', error);
        return [];
    }
}

// Запись пользователей
async function writeUsers(users) {
    try {
        await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Ошибка записи пользователей:', error);
    }
}

// Чтение сообщений
async function readMessages() {
    try {
        const data = await fs.readFile(MESSAGES_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (error) {
        console.error('Ошибка чтения сообщений:', error);
        return [];
    }
}

// Запись сообщений
async function writeMessages(messages) {
    try {
        await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Ошибка записи сообщений:', error);
    }
}

// Регистрация
app.post('/api/register', async (req, res) => {
    console.log('Получен запрос на регистрацию:', req.body);
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }

        const users = await readUsers();
        
        // Проверка на существование пользователя
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
        }
        
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
            online: false,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        await writeUsers(users);

        const token = jwt.sign({ userId: newUser.id }, JWT_SECRET);
        const userResponse = { ...newUser };
        delete userResponse.password;
        
        res.json({ token, user: userResponse });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    console.log('Получен запрос на вход:', req.body);
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
        const userResponse = { ...user };
        delete userResponse.password;
        
        res.json({ token, user: userResponse });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// Получение списка пользователей
app.get('/api/users', async (req, res) => {
    try {
        const users = await readUsers();
        const safeUsers = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        res.json(safeUsers);
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
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
        const safeUsers = filtered.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        res.json(safeUsers);
    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Socket.io для реального времени
io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('user-online', async (userId) => {
        try {
            const users = await readUsers();
            const user = users.find(u => u.id === userId);
            if (user) {
                user.online = true;
                await writeUsers(users);
                const safeUsers = users.map(u => {
                    const { password, ...userWithoutPassword } = u;
                    return userWithoutPassword;
                });
                io.emit('users-updated', safeUsers);
            }
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
        }
    });

    socket.on('user-offline', async (userId) => {
        try {
            const users = await readUsers();
            const user = users.find(u => u.id === userId);
            if (user) {
                user.online = false;
                await writeUsers(users);
                const safeUsers = users.map(u => {
                    const { password, ...userWithoutPassword } = u;
                    return userWithoutPassword;
                });
                io.emit('users-updated', safeUsers);
            }
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
        }
    });

    socket.on('send-message', async (messageData) => {
        try {
            const messages = await readMessages();
            const newMessage = {
                id: Date.now().toString(),
                ...messageData,
                timestamp: new Date().toISOString()
            };
            messages.push(newMessage);
            await writeMessages(messages);
            io.emit('new-message', newMessage);
            console.log('Новое сообщение:', newMessage);
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
        }
    });

    socket.on('get-messages', async ({ userId, otherUserId }) => {
        try {
            const messages = await readMessages();
            const filtered = messages.filter(m => 
                (m.senderId === userId && m.receiverId === otherUserId) ||
                (m.senderId === otherUserId && m.receiverId === userId)
            );
            socket.emit('messages-history', filtered);
        } catch (error) {
            console.error('Ошибка получения сообщений:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('Отключение:', socket.id);
    });
});

// Запуск сервера
initFiles().then(() => {
    server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT}`);
    });
}).catch(error => {
    console.error('Ошибка инициализации:', error);
});
