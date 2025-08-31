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

// 📁 Путь к файлу с пользователями
const usersFilePath = path.join(__dirname, 'users.json');

// 🔄 Функция для загрузки пользователей
function loadUsers() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
    }
    return [];
}

// 💾 Функция для сохранения пользователей
function saveUsers(users) {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
        console.log('💾 Пользователи сохранены');
    } catch (error) {
        console.error('❌ Ошибка сохранения пользователей:', error);
    }
}

// 👤 Функция для сохранения/обновления пользователя
function saveUserToFile(userData) {
    try {
        const users = loadUsers();
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
                avatar_url: userData.avatar_url,
                first_login: new Date().toISOString(),
                last_login: new Date().toISOString()
            });
        }
        
        saveUsers(users);
        console.log('💾 Пользователь сохранен:', userEmail);
        
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
    }
}

// 🚀 Маршрут для обмена кода на токен
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

        // 🔥 ВСЕ ДАННЫЕ В ОДНОМ ЗАПРОСЕ!
        const userResponse = await axios.get('https://login.yandex.ru/info', {
            headers: {
                'Authorization': `OAuth ${accessToken}`
            },
            params: {
                'format': 'json'
            }
        });

        const userData = userResponse.data;
        console.log('📊 Данные пользователя:', userData);

        // 🆕 ПОЛУЧАЕМ АВАТАРКУ из одного запроса
        let avatarUrl = null;
        if (userData && userData.default_avatar_id && userData.default_avatar_id !== '0') {
            avatarUrl = `https://avatars.yandex.net/get-yapic/${userData.default_avatar_id}/islands-200`;
            console.log('✅ Аватарка найдена:', avatarUrl);
        } else {
            console.log('ℹ️ У пользователя нет аватарки в Яндекс аккаунте');
        }

        // ✅ СОХРАНЯЕМ ПОЛЬЗОВАТЕЛЯ
        saveUserToFile({
            ...userData,
            avatar_url: avatarUrl
        });

        // Отправляем ответ
        res.json({
            success: true,
            user: {
                id: userData.id,
                login: userData.login,
                email: userData.default_email || userData.emails?.[0] || 'no-email',
                first_name: userData.first_name,
                last_name: userData.last_name,
                sex: userData.sex,
                avatar_url: avatarUrl
            }
        });

    } catch (error) {
        console.error('❌ Ошибка авторизации:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Authentication failed',
            details: error.response?.data || error.message
        });
    }
});

// 📊 Маршрут: Посмотреть всех пользователей
app.get('/api/users', (req, res) => {
    try {
        const users = loadUsers();
        res.json({ success: true, users: users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📈 Маршрут: Статистика
app.get('/api/stats', (req, res) => {
    try {
        const users = loadUsers();
        res.json({ 
            success: true, 
            total_users: users.length,
            last_user: users.length > 0 ? users[users.length - 1] : null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔐 АДМИН-ПАНЕЛЬ
app.get('/admin', (req, res) => {
    try {
        const users = loadUsers();

        let html = `<!DOCTYPE html><html><head><title>Панель администратора</title>
        <meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5;}
        .container{max-width:1200px;margin:0 auto;background:white;padding:30px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
        h1{color:#333;text-align:center;}h3{color:#444;}.stats{background:#e3f2fd;padding:20px;border-radius:8px;margin-bottom:25px;}
        table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd;}
        th{background:#2196F3;color:white;}tr:hover{background:#f5f5f5;}.avatar-cell{text-align:center;}
        .avatar-img{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);}
        .no-avatar{width:40px;height:40px;border-radius:50%;background:#667eea;color:white;display:flex;align-items:center;justify-content:center;
        font-weight:bold;font-size:14px;margin:0 auto;}</style></head><body><div class="container">`;

        html += '<h1>👨‍💼 Панель администратора</h1><div class="stats"><h3>📊 Статистика</h3>';
        html += '<p>Всего пользователей: <strong>' + users.length + '</strong></p>';
        
        if (users.length > 0) {
            html += '<p>Последний вход: <strong>' + new Date(users[users.length-1].last_login).toLocaleString('ru-RU') + '</strong></p>';
        }
        
        html += '</div><h3>👥 Список пользователей</h3>';
        
        if (users.length > 0) {
            html += '<table><tr><th>ID</th><th>Аватар</th><th>Имя</th><th>Email</th><th>Пол</th><th>Последний вход</th></tr>';
            
            users.forEach(user => {
                const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
                html += '<tr>';
                html += '<td><code>' + user.id + '</code></td>';
                html += '<td class="avatar-cell">' + 
                    (user.avatar_url ? 
                        '<img src="' + user.avatar_url + '" class="avatar-img" alt="Avatar">' : 
                        '<div class="no-avatar">' + initials + '</div>') + 
                    '</td>';
                html += '<td><strong>' + (user.first_name || '') + ' ' + (user.last_name || '') + '</strong></td>';
                html += '<td>' + (user.email || 'no-email') + '</td>';
                html += '<td>' + (user.sex === 'male' ? '♂ Мужской' : user.sex === 'female' ? '♀ Женский' : 'Не указан') + '</td>';
                html += '<td>' + new Date(user.last_login).toLocaleString('ru-RU') + '</td>';
                html += '</tr>';
            });
            
            html += '</table>';
        } else {
            html += '<p style="text-align:center;color:#666;padding:40px;">Пока нет пользователей</p>';
        }
        
        html += '</div></body></html>';
        
        res.send(html);

    } catch (error) {
        res.status(500).send('Ошибка загрузки админ-панели');
    }
});

// 🧪 Тестовый маршрут
app.get('/api/test', (req, res) => {
    const users = loadUsers();
    res.json({ 
        message: 'Сервер работает!',
        version: '2.0',
        total_users: users.length,
        persistent_storage: true
    });
});

// 🚀 Запуск сервера
app.listen(PORT, () => {
    const users = loadUsers();
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`👥 Пользователей в базе: ${users.length}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Админ: http://localhost:${PORT}/admin`);
    console.log('💾 Постоянное хранилище: ВКЛЮЧЕНО');
    console.log('==================================');
});
