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

// 📁 Папка для хранения пользователей (каждый в отдельном файле)
const usersDir = path.join(__dirname, 'users');

// 🔄 Создаем папку если ее нет
if (!fs.existsSync(usersDir)) {
    fs.mkdirSync(usersDir, { recursive: true });
    console.log('📁 Папка users создана');
}

// 💾 Функция для сохранения пользователя в отдельный файл
function saveUserToFile(userData) {
    try {
        const userEmail = userData.default_email || userData.emails?.[0] || 'no-email';
        const userId = userData.id;
        
        // Создаем объект пользователя
        const user = {
            id: userId,
            login: userData.login,
            email: userEmail,
            first_name: userData.first_name,
            last_name: userData.last_name,
            sex: userData.sex,
            avatar_url: userData.avatar_url,
            first_login: new Date().toISOString(),
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        // Сохраняем в отдельный файл
        const userFilePath = path.join(usersDir, `${userId}.json`);
        fs.writeFileSync(userFilePath, JSON.stringify(user, null, 2));
        
        console.log('💾 Пользователь сохранен:', userEmail);
        console.log('📁 Файл:', `${userId}.json`);
        
        return user;
        
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        return null;
    }
}

// 📂 Функция для загрузки всех пользователей
function loadAllUsers() {
    try {
        const files = fs.readdirSync(usersDir);
        const users = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(usersDir, file);
                const data = fs.readFileSync(filePath, 'utf8');
                const user = JSON.parse(data);
                users.push(user);
            }
        }
        
        // Сортируем по дате последнего входа (новые сверху)
        users.sort((a, b) => new Date(b.last_login) - new Date(a.last_login));
        
        console.log('👥 Загружено пользователей:', users.length);
        return users;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
        return [];
    }
}

// 🔄 Функция для обновления существующего пользователя
function updateUser(userData) {
    try {
        const userId = userData.id;
        const userFilePath = path.join(usersDir, `${userId}.json`);
        
        if (fs.existsSync(userFilePath)) {
            // Читаем существующие данные
            const data = fs.readFileSync(userFilePath, 'utf8');
            const existingUser = JSON.parse(data);
            
            // Обновляем только нужные поля
            const updatedUser = {
                ...existingUser,
                first_name: userData.first_name || existingUser.first_name,
                last_name: userData.last_name || existingUser.last_name,
                email: userData.default_email || userData.emails?.[0] || existingUser.email,
                avatar_url: userData.avatar_url || existingUser.avatar_url,
                last_login: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            // Сохраняем обратно
            fs.writeFileSync(userFilePath, JSON.stringify(updatedUser, null, 2));
            console.log('🔄 Пользователь обновлен:', updatedUser.email);
            
            return updatedUser;
        } else {
            // Если файла нет - создаем нового пользователя
            return saveUserToFile(userData);
        }
        
    } catch (error) {
        console.error('❌ Ошибка обновления:', error);
        return null;
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

        // 🆕 ПОЛУЧАЕМ АВАТАРКУ
        let avatarUrl = null;
        if (userData && userData.default_avatar_id && userData.default_avatar_id !== '0') {
            avatarUrl = `https://avatars.yandex.net/get-yapic/${userData.default_avatar_id}/islands-200`;
            console.log('✅ Аватарка найдена');
        }

        // ✅ СОХРАНЯЕМ/ОБНОВЛЯЕМ ПОЛЬЗОВАТЕЛЯ
        const userToSave = {
            ...userData,
            avatar_url: avatarUrl
        };
        
        const savedUser = updateUser(userToSave);

        if (!savedUser) {
            throw new Error('Failed to save user');
        }

        // Отправляем ответ
        res.json({
            success: true,
            user: {
                id: savedUser.id,
                login: savedUser.login,
                email: savedUser.email,
                first_name: savedUser.first_name,
                last_name: savedUser.last_name,
                sex: savedUser.sex,
                avatar_url: savedUser.avatar_url
            }
        });

    } catch (error) {
        console.error('❌ Ошибка авторизации:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
});

// 📊 Маршрут: Посмотреть всех пользователей
app.get('/api/users', (req, res) => {
    try {
        const users = loadAllUsers();
        res.json({ success: true, users: users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📈 Маршрут: Статистика
app.get('/api/stats', (req, res) => {
    try {
        const users = loadAllUsers();
        res.json({ 
            success: true, 
            total_users: users.length,
            last_user: users.length > 0 ? users[0] : null // Первый в списке - последний вошедший
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🧹 Маршрут для очистки старых пользователей (опционально)
app.delete('/api/users/old', (req, res) => {
    try {
        const users = loadAllUsers();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        
        let deletedCount = 0;
        
        users.forEach(user => {
            const lastLogin = new Date(user.last_login);
            if (lastLogin < thirtyDaysAgo) {
                const userFilePath = path.join(usersDir, `${user.id}.json`);
                if (fs.existsSync(userFilePath)) {
                    fs.unlinkSync(userFilePath);
                    deletedCount++;
                }
            }
        });
        
        res.json({ 
            success: true, 
            message: `Удалено ${deletedCount} неактивных пользователей` 
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔐 АДМИН-ПАНЕЛЬ
app.get('/admin', (req, res) => {
    try {
        const users = loadAllUsers();

        let html = `<!DOCTYPE html><html><head><title>Панель администратора</title>
        <meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5;}
        .container{max-width:1200px;margin:0 auto;background:white;padding:30px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
        h1{color:#333;text-align:center;}h3{color:#444;}.stats{background:#e3f2fd;padding:20px;border-radius:8px;margin-bottom:25px;}
        table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd;}
        th{background:#2196F3;color:white;}tr:hover{background:#f5f5f5;}.avatar-cell{text-align:center;}
        .avatar-img{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);}
        .no-avatar{width:40px;height:40px;border-radius:50%;background:#667eea;color:white;display:flex;align-items:center;justify-content:center;
        font-weight:bold;font-size:14px;margin:0 auto;}.info{color:#666;font-size:14px;margin-top:10px;}</style></head><body><div class="container">`;

        html += '<h1>👨‍💼 Панель администратора</h1><div class="stats"><h3>📊 Статистика</h3>';
        html += '<p>Всего пользователей: <strong>' + users.length + '</strong></p>';
        
        if (users.length > 0) {
            html += '<p>Последний вход: <strong>' + new Date(users[0].last_login).toLocaleString('ru-RU') + '</strong></p>';
            html += '<p class="info">💾 Данные хранятся в отдельных файлах (гарантированно)</p>';
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
    const users = loadAllUsers();
    res.json({ 
        message: 'Сервер работает!',
        version: '3.0',
        total_users: users.length,
        storage_type: 'multi_file',
        persistent: true
    });
});

// 🚀 Запуск сервера
app.listen(PORT, () => {
    const users = loadAllUsers();
    console.log('==================================');
    console.log('🚀 СЕРВЕР ЗАПУЩЕН!');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`👥 Пользователей в базе: ${users.length}`);
    console.log(`📍 Тест: http://localhost:${PORT}/api/test`);
    console.log(`📍 Админ: http://localhost:${PORT}/admin`);
    console.log('💾 Гарантированное хранилище: ВКЛЮЧЕНО');
    console.log('📁 Каждый пользователь в отдельном файле');
    console.log('==================================');
});
