console.log('🟢 Запускаюсь...');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Функция для сохранения пользователей в файл
function saveUserToFile(userData) {
    try {
        const filePath = path.join(__dirname, 'users.json');
        let users = [];
        
        // Читаем существующих пользователей
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            users = JSON.parse(data);
        }
        
        // Получаем email (исправляем ошибку с undefined)
        const userEmail = userData.default_email || userData.emails?.[0] || 'no-email';
        
        // Проверяем, есть ли уже такой пользователь
        const existingUserIndex = users.findIndex(u => u.id === userData.id);
        
        if (existingUserIndex !== -1) {
            // Обновляем существующего
            users[existingUserIndex] = {
                ...users[existingUserIndex],
                ...userData,
                email: userEmail,
                last_login: new Date().toISOString()
            };
        } else {
            // Добавляем нового
            users.push({
                id: userData.id,
                login: userData.login,
                email: userEmail,
                first_name: userData.first_name,
                last_name: userData.last_name,
                sex: userData.sex,
                first_login: new Date().toISOString(),
                last_login: new Date().toISOString()
            });
        }
        
        // Сохраняем обратно в файл
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        console.log('💾 Пользователь сохранен:', userEmail);
        
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
    }
}

// Маршрут для обмена кода на токен
app.post('/api/yandex-auth', async (req, res) => {
    console.log('📨 Получен запрос на авторизацию');
    
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Authorization code is required'
            });
        }

        // Получаем access token от Яндекс
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', process.env.CLIENT_ID);
        params.append('client_secret', process.env.CLIENT_SECRET);

        const tokenResponse = await axios.post(
            'https://oauth.yandex.ru/token',
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            throw new Error('Failed to get access token');
        }

        // Получаем данные пользователя
        const userResponse = await axios.get('https://login.yandex.ru/info', {
            headers: {
                'Authorization': `OAuth ${accessToken}`
            },
            params: {
                'format': 'json'
            }
        });

        const userData = userResponse.data;
        
        // ✅ СОХРАНЯЕМ ПОЛЬЗОВАТЕЛЯ В ФАЙЛ
        saveUserToFile(userData);

        // Отправляем ответ
        res.json({
            success: true,
            user: {
                id: userData.id,
                login: userData.login,
                email: userData.default_email || userData.emails?.[0] || 'no-email',
                first_name: userData.first_name,
                last_name: userData.last_name,
                sex: userData.sex
            }
        });

    } catch (error) {
        console.error('❌ Ошибка авторизации:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
});

// 📊 Маршрут: Посмотреть всех пользователей (JSON)
app.get('/api/users', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'users.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const users = JSON.parse(data);
            res.json({ success: true, users: users });
        } else {
            res.json({ success: true, users: [], message: 'Пока нет пользователей' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📈 Маршрут: Получить статистику
app.get('/api/stats', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'users.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const users = JSON.parse(data);
            res.json({ 
                success: true, 
                total_users: users.length,
                last_user: users.length > 0 ? users[users.length - 1] : null
            });
        } else {
            res.json({ success: true, total_users: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔐 АДМИН-ПАНЕЛЬ - красивый интерфейс
app.get('/admin', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'users.json');
        let users = [];
        
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            users = JSON.parse(data);
        }

        // Создаем красивую HTML-страницу
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Панель администратора</title>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 15px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 { 
            color: #333; 
            text-align: center; 
            margin-bottom: 30px;
            font-size: 2.5em;
        }
        .stats { 
            background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
            padding: 25px; 
            border-radius: 10px; 
            margin-bottom: 30px;
            border-left: 5px solid #2196F3;
        }
        .stats h3 {
            margin-top: 0;
            color: #1976d2;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
            font-size: 14px;
        }
        th, td { 
            padding: 15px 12px; 
            text-align: left; 
            border-bottom: 1px solid #e0e0e0; 
        }
        th { 
            background: linear-gradient(135deg, #2196F3 0%, #1976d2 100%);
            color: white; 
            font-weight: 600;
            position: sticky;
            top: 0;
        }
        tr:hover { 
            background: #f8f9fa; 
        }
        .badge { 
            background: #4CAF50; 
            color: white; 
            padding: 6px 12px; 
            border-radius: 20px; 
            font-size: 12px; 
            font-weight: bold;
        }
        .male { color: #1976d2; font-weight: bold; }
        .female { color: #d81b60; font-weight: bold; }
        .user-count {
            font-size: 2em;
            font-weight: bold;
            color: #2196F3;
        }
        .last-login {
            background: #e8f5e8;
            padding: 10px;
            border-radius: 5px;
            margin-top: 10px;
        }
        .no-users {
            text-align: center;
            padding: 60px 20px;
            color: #666;
            font-size: 1.2em;
        }
        .no-users-icon {
            font-size: 4em;
            margin-bottom: 20px;
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>👨‍💼 Панель администратора</h1>
        
        <div class="stats">
            <h3>📊 Статистика пользователей</h3>
            <div class="user-count">${users.length} пользователей</div>
            ${users.length > 0 ? `
                <div class="last-login">
                    <strong>Последний вход:</strong><br>
                    ${new Date(users[users.length-1].last_login).toLocaleString('ru-RU')}<br>
                    <strong>Пользователь:</strong> ${users[users.length-1].first_name} ${users[users.length-1].last_name}
                </div>
            ` : ''}
        </div>

        <h3>👥 Список всех пользователей</h3>
        ${users.length > 0 ? `
            <table>
                <tr>
                    <th>ID</th>
                    <th>Имя и фамилия</th>
                    <th>Email</th>
                    <th>Логин</th>
                    <th>Пол</th>
                    <th>Первая авторизация</th>
                    <th>Последний вход</th>
                </tr>
                ${users.map(user => `
                    <tr>
                        <td><code>${user.id}</code></td>
                        <td><strong>${user.first_name || ''} ${user.last_name || ''}</strong></td>
                        <td>${user.email || 'no-email'}</td>
                        <td>${user.login || 'no-login'}</td>
                        <td>
                            ${user.sex === 'male' ? '<span class="male">♂ Мужской</span>' : 
                              user.sex === 'female' ? '<span class="female">♀ Женский</span>' : 
                              'Не указан'}
                        </td>
                        <td>${new Date(user.first_login).toLocaleString('ru-RU')}</td>
                        <td>${new Date(user.last_login).toLocaleString('ru-RU')}</td>
                    </tr>
                `).join('')}
            </table>
        ` : '
            <div class="no-users">
                <div class="no-users-icon">👥</div>
                <p>Пока нет пользователей</p>
                <p>Как только кто-то авторизуется через Яндекс,<br>они появятся в этой таблице</p>
            </div>
        '}
    </div>
</body>
</html>
        `;

        res.send(html);

    } catch (error) {
        res.status(500).send('Ошибка загрузки админ-панели: ' + error.message);
    }
});

// Тестовый маршрут
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Сервер работает!',
        version: '1.0',
        has_database: true,
        admin_panel: 'https://yandex-auth-server.onrender.com/admin'
    });
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Админ-панель: http://localhost:${PORT}/admin`);
    console.log(`📍 Пользователи (JSON): http://localhost:${PORT}/api/users`);
    console.log('==================================');
});
