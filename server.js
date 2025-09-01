console.log('🟢 Сервер запускается...');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
    origin: ['https://rustorguo.ru', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// 📁 Папка для хранения пользователей
const usersDir = path.join(__dirname, 'users');

// 🔄 Создаем папку если ее нет
if (!fs.existsSync(usersDir)) {
    fs.mkdirSync(usersDir, { recursive: true });
    console.log('📁 Папка users создана');
}

// 💾 Функция для сохранения пользователя
function saveUser(userData) {
    try {
        const userId = userData.id;
        const userEmail = userData.default_email || 'no-email';
        
        const user = {
            id: userId,
            login: userData.login,
            email: userEmail,
            first_name: userData.first_name,
            last_name: userData.last_name,
            sex: userData.sex,
            first_login: new Date().toISOString(),
            last_login: new Date().toISOString()
        };
        
        // Сохраняем в файл
        const userFile = path.join(usersDir, `${userId}.json`);
        fs.writeFileSync(userFile, JSON.stringify(user, null, 2));
        
        console.log('💾 Пользователь сохранен:', userEmail);
        return user;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        return null;
    }
}

// 📂 Загрузка всех пользователей
function loadUsers() {
    try {
        if (!fs.existsSync(usersDir)) return [];
        
        const files = fs.readdirSync(usersDir);
        const users = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(usersDir, file);
                    const data = fs.readFileSync(filePath, 'utf8');
                    const user = JSON.parse(data);
                    users.push(user);
                } catch (e) {
                    console.error('❌ Ошибка чтения файла:', file);
                }
            }
        }
        
        return users.sort((a, b) => new Date(b.last_login) - new Date(a.last_login));
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
        return [];
    }
}

// 🚀 Основной маршрут авторизации
app.post('/api/yandex-auth', async (req, res) => {
    console.log('📨 Получен запрос на авторизацию');
    
    try {
        const { code } = req.body;

        // Проверка кода
        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Неверный код авторизации'
            });
        }

        console.log('🔐 Обмен кода на токен...');

        // Получаем токен от Яндекс
        const tokenResponse = await axios.post(
            'https://oauth.yandex.ru/token',
            `grant_type=authorization_code&code=${code}&client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            }
        );

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            throw new Error('Не удалось получить токен доступа');
        }

        console.log('✅ Токен получен');

        // Получаем данные пользователя
        const userResponse = await axios.get('https://login.yandex.ru/info', {
            headers: {
                'Authorization': `OAuth ${accessToken}`
            },
            params: { format: 'json' },
            timeout: 10000
        });

        const userData = userResponse.data;

        // Сохраняем пользователя
        const savedUser = saveUser(userData);

        if (!savedUser) {
            throw new Error('Ошибка сохранения пользователя');
        }

        // Успешный ответ
        res.json({
            success: true,
            user: {
                id: savedUser.id,
                login: savedUser.login,
                email: savedUser.email,
                first_name: savedUser.first_name,
                last_name: savedUser.last_name,
                sex: savedUser.sex
            }
        });

    } catch (error) {
        console.error('❌ Ошибка авторизации:', error.message);
        
        res.status(500).json({
            success: false,
            error: 'Ошибка авторизации',
            details: error.message
        });
    }
});

// 📊 Получить всех пользователей
app.get('/api/users', (req, res) => {
    try {
        const users = loadUsers();
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📈 Статистика
app.get('/api/stats', (req, res) => {
    try {
        const users = loadUsers();
        res.json({ 
            success: true, 
            total_users: users.length,
            last_login: users[0] ? new Date(users[0].last_login).toLocaleString('ru-RU') : 'нет'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🧪 Тестовый маршрут
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Сервер работает! ✅',
        timestamp: new Date().toLocaleString('ru-RU')
    });
});

// 🔐 Админ панель
app.get('/admin', (req, res) => {
    try {
        const users = loadUsers();
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Панель администратора</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; }
        h1 { color: #333; text-align: center; }
        .stats { background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 25px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #2196F3; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>👨‍💼 Панель администратора</h1>
        <div class="stats">
            <h3>📊 Статистика</h3>
            <p>Всего пользователей: <strong>${users.length}</strong></p>
            ${users.length > 0 ? `<p>Последний вход: <strong>${new Date(users[0].last_login).toLocaleString('ru-RU')}</strong></p>` : ''}
        </div>
        <h3>👥 Список пользователей</h3>
        ${users.length > 0 ? `
            <table>
                <tr><th>ID</th><th>Имя</th><th>Email</th><th>Логин</th><th>Последний вход</th></tr>
                ${users.map(user => `
                    <tr>
                        <td>${user.id}</td>
                        <td><strong>${user.first_name} ${user.last_name}</strong></td>
                        <td>${user.email}</td>
                        <td>${user.login}</td>
                        <td>${new Date(user.last_login).toLocaleString('ru-RU')}</td>
                    </tr>
                `).join('')}
            </table>
        ` : '<p style="text-align: center; color: #666; padding: 40px;">Пока нет пользователей</p>'}
    </div>
</body>
</html>`;
        
        res.send(html);

    } catch (error) {
        res.status(500).send('Ошибка загрузки админ-панели');
    }
});

// 🏠 Корневой маршрут
app.get('/', (req, res) => {
    res.json({
        message: 'Yandex Auth Server',
        endpoints: {
            test: '/api/test',
            auth: '/api/yandex-auth (POST)',
            users: '/api/users',
            stats: '/api/stats',
            admin: '/admin'
        }
    });
});

// 🚀 Запуск сервера
app.listen(PORT, () => {
    const users = loadUsers();
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`👥 Пользователей: ${users.length}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Админ: http://localhost:${PORT}/admin`);
    console.log('==================================');
});
