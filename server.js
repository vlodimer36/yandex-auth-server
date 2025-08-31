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
                avatar_url: userData.avatar_url,
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

        // 🆕 ПОЛУЧАЕМ ИНФОРМАЦИЮ ОБ АВАТАРКЕ
        let avatarUrl = null;
        try {
            const avatarInfoResponse = await axios.get('https://login.yandex.ru/info', {
                headers: {
                    'Authorization': `OAuth ${accessToken}`
                },
                params: {
                    'format': 'json'
                }
            });

            const avatarInfo = avatarInfoResponse.data;
            
            // Проверяем, есть ли аватарка у пользователя
            if (avatarInfo && avatarInfo.default_avatar_id && avatarInfo.default_avatar_id !== '0') {
                // Формируем URL аватарки (islands-200 - размер 200x200)
                avatarUrl = `https://avatars.yandex.net/get-yapic/${avatarInfo.default_avatar_id}/islands-200`;
                console.log('✅ Аватарка найдена:', avatarUrl);
            } else {
                console.log('ℹ️ У пользователя нет аватарки в Яндекс аккаунте');
            }
        } catch (avatarError) {
            console.log('⚠️ Не удалось получить аватарку:', avatarError.message);
        }

        // ✅ СОХРАНЯЕМ ПОЛЬЗОВАТЕЛЯ В ФАЙЛ
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
                avatar_url: avatarUrl // 🆕 Добавляем URL аватарки
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

// 🔐 АДМИН-ПАНЕЛЬ - УПРОЩЕННАЯ ВЕРСИЯ
app.get('/admin', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'users.json');
        let users = [];
        
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            users = JSON.parse(data);
        }

        // Простая HTML-страница без сложных шаблонных строк
        let html = '<!DOCTYPE html><html><head><title>Панель администратора</title>';
        html += '<meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;margin:20px;}';
        html += '.container{max-width:1200px;margin:0 auto;}h1{color:#333;}';
        html += 'table{width:100%;border-collapse:collapse;}th,td{padding:10px;border:1px solid #ddd;}';
        html += 'th{background:#f5f5f5;}</style></head><body>';
        html += '<div class="container"><h1>Панель администратора</h1>';
        
        html += '<h3>Статистика</h3>';
        html += '<p>Всего пользователей: <strong>' + users.length + '</strong></p>';
        
        if (users.length > 0) {
            html += '<p>Последний вход: <strong>' + new Date(users[users.length-1].last_login).toLocaleString('ru-RU') + '</strong></p>';
        }
        
        html += '<h3>Список пользователей</h3>';
        
        if (users.length > 0) {
            html += '<table><tr><th>ID</th><th>Имя</th><th>Email</th><th>Аватар</th><th>Пол</th><th>Последний вход</th></tr>';
            
            users.forEach(user => {
                html += '<tr>';
                html += '<td>' + user.id + '</td>';
                html += '<td><strong>' + (user.first_name || '') + ' ' + (user.last_name || '') + '</strong></td>';
                html += '<td>' + (user.email || 'no-email') + '</td>';
                html += '<td>' + (user.avatar_url ? '✅ Есть' : '❌ Нет') + '</td>';
                html += '<td>' + (user.sex === 'male' ? 'Мужской' : user.sex === 'female' ? 'Женский' : 'Не указан') + '</td>';
                html += '<td>' + new Date(user.last_login).toLocaleString('ru-RU') + '</td>';
                html += '</tr>';
            });
            
            html += '</table>';
        } else {
            html += '<p>Пока нет пользователей</p>';
        }
        
        html += '</div></body></html>';
        
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
        admin_panel: '/admin',
        features: 'avatar_support' // 🆕 Поддержка аватарок
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Админ-панель: http://localhost:${PORT}/admin`);
    console.log('🆕 Поддержка аватарок: ВКЛЮЧЕНА');
    console.log('==================================');
});
