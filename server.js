console.log('🟢 Запускаюся...');

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
                email: userData.default_email,
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
