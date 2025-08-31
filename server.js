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
        
        // Проверяем, есть ли уже такой пользователь
        const existingUserIndex = users.findIndex(u => u.id === userData.id);
        
        if (existingUserIndex !== -1) {
            // Обновляем существующего
            users[existingUserIndex] = {
                ...users[existingUserIndex],
                ...userData,
                last_login: new Date().toISOString()
            };
        } else {
            // Добавляем нового
            users.push({
                ...userData,
                first_login: new Date().toISOString(),
                last_login: new Date().toISOString()
            });
        }
        
        // Сохраняем обратно в файл
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        console.log('💾 Пользователь сохранен:', userData.email);
        
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

// 📊 НОВЫЙ МАРШРУТ: Посмотреть всех пользователей
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

// 📋 НОВЫЙ МАРШРУТ: Получить количество пользователей
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

// Тестовый маршрут
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Сервер работает!',
        version: '1.0',
        has_database: true
    });
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
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .stats { background: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #2196F3; color: white; }
        tr:hover { background: #f5f5f5; }
        .badge { background: #4CAF50; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>👨‍💼 Панель администратора</h1>
        
        <div class="stats">
            <h3>📊 Статистика</h3>
            <p>Всего пользователей: <strong>${users.length}</strong></p>
            <p>Последняя авторизация: <strong>${users.length > 0 ? new Date(users[users.length-1].last_login).toLocaleString() : 'нет данных'}</strong></p>
        </div>

        <h3>👥 Список пользователей</h3>
        ${users.length > 0 ? `
            <table>
                <tr>
                    <th>ID</th>
                    <th>Имя</th>
                    <th>Email</th>
                    <th>Пол</th>
                    <th>Первая авторизация</th>
                    <th>Последний вход</th>
                </tr>
                ${users.map(user => `
                    <tr>
                        <td>${user.id}</td>
                        <td><strong>${user.first_name || ''} ${user.last_name || ''}</strong></td>
                        <td>${user.email || 'no-email'}</td>
                        <td>${user.sex === 'male' ? '♂ Мужской' : user.sex === 'female' ? '♀ Женский' : 'Не указан'}</td>
                        <td>${new Date(user.first_login).toLocaleString()}</td>
                        <td>${new Date(user.last_login).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </table>
        ` : '
            <p style="text-align: center; color: #666; padding: 40px;">
                Пока нет пользователей. Как только кто-то авторизуется, они появятся здесь.
            </p>
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
// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Пользователи: http://localhost:${PORT}/api/users`);
    console.log(`📍 Статистика: http://localhost:${PORT}/api/stats`);
    console.log('==================================');
});
