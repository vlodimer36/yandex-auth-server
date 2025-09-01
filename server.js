console.log('🟢 Сервер запускается...');

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// 📊 Хранилище пользователей в памяти (на время работы сервера)
let users = [];

// 🚀 Основной маршрут авторизации
app.post('/api/yandex-auth', async (req, res) => {
    console.log('📨 Получен запрос на авторизацию');
    
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Неверный код авторизации'
            });
        }

        // Получаем токен от Яндекс
        const tokenResponse = await axios.post(
            'https://oauth.yandex.ru/token',
            `grant_type=authorization_code&code=${code}&client_id=872c3f930c404f929e2f55b77d94c94c&client_secret=d900e81d1c2144648549314afda460bb`,
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
        const user = {
            id: userData.id,
            login: userData.login,
            email: userData.default_email || 'no-email',
            first_name: userData.first_name,
            last_name: userData.last_name,
            last_login: new Date().toLocaleString('ru-RU')
        };

        // Добавляем/обновляем в памяти
        const existingIndex = users.findIndex(u => u.id === userData.id);
        if (existingIndex !== -1) {
            users[existingIndex] = user;
        } else {
            users.push(user);
        }

        console.log('✅ Пользователь авторизован:', user.email);

        // Успешный ответ
        res.json({
            success: true,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name
            }
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        
        res.status(500).json({
            success: false,
            error: 'Ошибка авторизации',
            details: error.message
        });
    }
});

// 📊 Получить всех пользователей
app.get('/api/users', (req, res) => {
    res.json({ success: true, users });
});

// 📈 Статистика
app.get('/api/stats', (req, res) => {
    res.json({ 
        success: true, 
        total_users: users.length,
        last_login: users[0] ? users[0].last_login : 'нет'
    });
});

// 🧪 Тестовый маршрут
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Сервер работает! ✅',
        users_count: users.length
    });
});

// 🔐 Админ панель
app.get('/admin', (req, res) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Панель администратора</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; }
        h1 { color: #333; text-align: center; }
        .stats { background: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #2196F3; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>👨‍💼 Панель администратора</h1>
        <div class="stats">
            <h3>📊 Статистика</h3>
            <p>Всего пользователей: <strong>${users.length}</strong></p>
            ${users.length > 0 ? `<p>Последний вход: <strong>${users[0].last_login}</strong></p>` : ''}
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
                        <td>${user.last_login}</td>
                    </tr>
                `).join('')}
            </table>
        ` : '<p style="text-align: center; color: #666; padding: 40px;">Пока нет пользователей</p>'}
    </div>
</body>
</html>`;
    
    res.send(html);
});

// 🏠 Корневой маршрут
app.get('/', (req, res) => {
    res.json({
        message: 'Yandex Auth Server',
        status: 'working',
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
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Админ: http://localhost:${PORT}/admin`);
    console.log('==================================');
});
