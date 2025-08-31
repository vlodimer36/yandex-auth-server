console.log('🟢 Запускаюсь...');

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Маршрут для обмена кода на токен
app.post('/api/yandex-auth', async (req, res) => {
    console.log('📨 Получен запрос на авторизацию');
    
    try {
        const { code } = req.body;

        if (!code) {
            console.log('❌ Ошибка: нет кода авторизации');
            return res.status(400).json({
                success: false,
                error: 'Authorization code is required'
            });
        }

        console.log('🔐 Получен код:', code);

        // Параметры для запроса к Яндекс
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', process.env.CLIENT_ID);
        params.append('client_secret', process.env.CLIENT_SECRET);

        // Получаем access token от Яндекс
        console.log('🔄 Обмениваю код на токен...');
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
        console.log('✅ Токен получен:', accessToken ? 'успешно' : 'не получен');

        if (!accessToken) {
            throw new Error('Failed to get access token');
        }

        // Получаем данные пользователя
        console.log('👤 Запрашиваю данные пользователя...');
        const userResponse = await axios.get('https://login.yandex.ru/info', {
            headers: {
                'Authorization': `OAuth ${accessToken}`
            },
            params: {
                'format': 'json'
            }
        });

        const userData = userResponse.data;
        console.log('✅ Данные пользователя получены:', userData.login);

        // Успешный ответ
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
        console.error('❌ Ошибка авторизации:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Authentication failed',
            details: error.response?.data || error.message
        });
    }
});

// Тестовый маршрут
app.get('/api/test', (req, res) => {
    console.log('✅ Кто-то зашел на /api/test');
    res.json({ 
        message: 'Сервер работает! Ура!',
        client_id: process.env.CLIENT_ID ? 'настроен' : 'не настроен'
    });
});

// Запускаем сервер
app.listen(PORT, '0.0.0.0', () => {
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Для авторизации: POST http://localhost:${PORT}/api/yandex-auth`);
    console.log('==================================');
});