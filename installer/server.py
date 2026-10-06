#!/usr/bin/env python3
"""
Nuvio TV VIDAA Installer Server
===============================
Zero-dependency Python server that:
  1. Spoofs DNS so vidaahub.com resolves to this machine
  2. Serves the installer page over HTTPS on port 443
  3. Auto-generates a self-signed SSL certificate

Usage:  sudo python3 server.py
Requires: Python 3.6+, OpenSSL CLI (for cert generation)
Run as admin/root (ports 53 and 443 are privileged).
"""

import http.server
import ssl
import socket
import struct
import threading
import subprocess
import tempfile
import os
import sys
import signal
import mimetypes
import urllib.parse
import re

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SPOOF_DOMAIN = "vidaahub.com"
DNS_PORT = 53
HTTPS_PORT = 443
INSTALLER_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(INSTALLER_DIR)
FALLBACK_UPSTREAM_DNS_SERVERS = [("1.1.1.1", 53), ("8.8.8.8", 53)]

# ---------------------------------------------------------------------------
# Utility: detect local IP
# ---------------------------------------------------------------------------

def get_local_ip():
    """Return the LAN IP address of this machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def is_ipv4_address(value):
    """Return True when value is a valid IPv4 address."""
    try:
        socket.inet_aton(value)
        return True
    except OSError:
        return False


def discover_system_dns_servers():
    """Discover upstream IPv4 DNS servers from env or host configuration."""
    env_value = os.environ.get("NUVIO_INSTALLER_DNS", "")
    if env_value.strip():
        servers = []
        for item in env_value.split(","):
            address = item.strip()
            if is_ipv4_address(address):
                servers.append((address, 53))
        if servers:
            return servers

    if os.path.exists("/etc/resolv.conf"):
        try:
            with open("/etc/resolv.conf", "r", encoding="utf-8", errors="ignore") as f:
                servers = []
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 2 and parts[0] == "nameserver" and is_ipv4_address(parts[1]):
                        if not parts[1].startswith("127."):
                            servers.append((parts[1], 53))
                if servers:
                    return servers
        except Exception:
            pass

    return FALLBACK_UPSTREAM_DNS_SERVERS


UPSTREAM_DNS_SERVERS = discover_system_dns_servers()

# ---------------------------------------------------------------------------
# SSL Certificate Generation
# ---------------------------------------------------------------------------

def generate_self_signed_cert(cert_path, key_path):
    """Generate a self-signed certificate for vidaahub.com using OpenSSL CLI."""
    cmd = [
        "openssl", "req", "-x509",
        "-newkey", "rsa:2048",
        "-keyout", key_path,
        "-out", cert_path,
        "-days", "30",
        "-nodes",
        "-subj", f"/CN={SPOOF_DOMAIN}",
        "-addext", f"subjectAltName=DNS:{SPOOF_DOMAIN}",
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        print("[ERROR] 'openssl' command not found. Please install OpenSSL.")
        sys.exit(1)
    except subprocess.CalledProcessError:
        # Retry without -addext (older OpenSSL versions)
        cmd_fallback = [
            "openssl", "req", "-x509",
            "-newkey", "rsa:2048",
            "-keyout", key_path,
            "-out", cert_path,
            "-days", "30",
            "-nodes",
            "-subj", f"/CN={SPOOF_DOMAIN}",
        ]
        subprocess.run(cmd_fallback, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---------------------------------------------------------------------------
# Minimal DNS Server (UDP port 53)
# ---------------------------------------------------------------------------

def parse_dns_question(data):
    """Extract the queried domain name and query type from a raw DNS request."""
    idx = 12
    parts = []
    while idx < len(data):
        length = data[idx]
        if length == 0:
            idx += 1
            break
        idx += 1
        parts.append(data[idx:idx + length].decode("ascii", errors="ignore"))
        idx += length

    domain = ".".join(parts).lower()
    qtype = struct.unpack("!H", data[idx:idx + 2])[0] if idx + 2 <= len(data) else 0
    return domain, qtype


def build_dns_response(data, ip):
    """Build a DNS response mapping the queried domain to ip (A record)."""
    tx_id = data[:2]
    flags = b"\x81\x80"
    qdcount = data[4:6]
    ancount = b"\x00\x01"
    nscount = b"\x00\x00"
    arcount = b"\x00\x00"

    header = tx_id + flags + qdcount + ancount + nscount + arcount

    idx = 12
    while idx < len(data) and data[idx] != 0:
        idx += 1 + data[idx]
    idx += 1
    question = data[12:idx + 4]

    answer_name = b"\xc0\x0c"
    answer_type = b"\x00\x01"
    answer_class = b"\x00\x01"
    answer_ttl = struct.pack("!I", 60)
    answer_rdlen = b"\x00\x04"
    answer_rdata = socket.inet_aton(ip)

    answer = answer_name + answer_type + answer_class + answer_ttl + answer_rdlen + answer_rdata
    return header + question + answer


def build_empty_dns_response(data):
    """Build a NOERROR response with 0 answers (for AAAA queries)."""
    tx_id = data[:2]
    flags = b"\x81\x80"
    qdcount = data[4:6]
    ancount = b"\x00\x00"
    nscount = b"\x00\x00"
    arcount = b"\x00\x00"

    header = tx_id + flags + qdcount + ancount + nscount + arcount

    idx = 12
    while idx < len(data) and data[idx] != 0:
        idx += 1 + data[idx]
    idx += 1
    question = data[12:idx + 4]
    return header + question


def forward_dns_query(data):
    """Forward a DNS query to upstream DNS servers."""
    for upstream in UPSTREAM_DNS_SERVERS:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2.0)
            sock.sendto(data, upstream)
            response, _ = sock.recvfrom(4096)
            sock.close()
            return response
        except Exception:
            continue
    return None


def dns_server(local_ip):
    """Run DNS spoofing UDP server on port 53."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind(("0.0.0.0", DNS_PORT))
    except PermissionError:
        print(f"[ERROR] Permission denied binding to DNS port {DNS_PORT}. Please run as root/sudo.")
        os._exit(1)
    except OSError as e:
        print(f"[ERROR] Could not bind to DNS port {DNS_PORT}: {e}")
        os._exit(1)

    print(f"[DNS]   Listening on port {DNS_PORT} (spoofing {SPOOF_DOMAIN} -> {local_ip})")

    while True:
        try:
            data, addr = sock.recvfrom(512)
            domain, qtype = parse_dns_question(data)

            if domain == SPOOF_DOMAIN and qtype == 1:
                response = build_dns_response(data, local_ip)
                if response:
                    sock.sendto(response, addr)
                    print(f"[DNS]   {addr[0]} queried {domain} -> {local_ip} (spoofed)")
                continue

            if domain == SPOOF_DOMAIN and qtype == 28:
                response = build_empty_dns_response(data)
                if response:
                    sock.sendto(response, addr)
                continue

            response = forward_dns_query(data)
            if response:
                sock.sendto(response, addr)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# HTTPS server (port 443)
# ---------------------------------------------------------------------------

class InstallerHandler(http.server.SimpleHTTPRequestHandler):
    """Serve installer UI, web app, and assets."""

    SHARED_FILES = {
        "icon.png": os.path.join(REPO_ROOT, "assets", "images", "icon.png"),
        "largeIcon.png": os.path.join(REPO_ROOT, "assets", "images", "largeIcon.png"),
        "logo.png": os.path.join(REPO_ROOT, "assets", "brand", "app_logo_wordmark.png"),
        "nuviotv.png": os.path.join(REPO_ROOT, "assets", "images", "nuviotv.png")
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=INSTALLER_DIR, **kwargs)

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Dedicated installer UI endpoints
        if path in ("/install", "/installer", "/installer/", "/install/index.html", "/installer/index.html"):
            installer_index = os.path.join(INSTALLER_DIR, "index.html")
            if os.path.exists(installer_index):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(os.path.getsize(installer_index)))
                self.end_headers()
                with open(installer_index, "rb") as f:
                    self.wfile.write(f.read())
                return

        # Shared installer branding assets
        if path.startswith("/shared/"):
            filename = path.split("/", 2)[-1]
            file_path = self.SHARED_FILES.get(filename)
            if not file_path or not os.path.exists(file_path):
                # Fallback to current folder icon if available
                alt_path = os.path.join(INSTALLER_DIR, filename)
                if os.path.exists(alt_path):
                    file_path = alt_path
                else:
                    self.send_error(404, "File not found")
                    return

            mime_type, _ = mimetypes.guess_type(file_path)
            self.send_response(200)
            self.send_header("Content-Type", mime_type or "application/octet-stream")
            self.send_header("Content-Length", str(os.path.getsize(file_path)))
            self.end_headers()
            with open(file_path, "rb") as handle:
                self.wfile.write(handle.read())
            return

        # Serve web app files from dist or root
        app_dir = None
        candidates = [
            os.path.join(REPO_ROOT, "dist", "vidaa"),
            os.path.join(REPO_ROOT, "dist"),
            REPO_ROOT,
        ]
        for c in candidates:
            if os.path.isfile(os.path.join(c, "app.bundle.js")):
                app_dir = c
                break

        if app_dir:
            req_rel = path.lstrip("/")
            if not req_rel or req_rel == "index.html":
                req_rel = "index.html"
            file_path = os.path.normpath(os.path.join(app_dir, req_rel))
            if file_path.startswith(app_dir) and os.path.isfile(file_path):
                mime_type, _ = mimetypes.guess_type(file_path)
                if not mime_type:
                    if file_path.endswith(".mjs") or file_path.endswith(".js"):
                        mime_type = "application/javascript"
                    elif file_path.endswith(".json"):
                        mime_type = "application/json"
                    elif file_path.endswith(".css"):
                        mime_type = "text/css"
                    else:
                        mime_type = "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", mime_type)
                self.send_header("Content-Length", str(os.path.getsize(file_path)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                with open(file_path, "rb") as handle:
                    self.wfile.write(handle.read())
                return

        # Fallback to installer page if app bundle not yet built
        if path in ("/", "/index.html"):
            return super().do_GET()

        self.send_error(404, "File not found")

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


def https_server(cert_path, key_path):
    """Run an HTTPS server on port 443."""
    try:
        server = http.server.HTTPServer(("0.0.0.0", HTTPS_PORT), InstallerHandler)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert_path, key_path)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        print(f"[HTTPS] Listening on port {HTTPS_PORT} for vidaahub.com")
        server.serve_forever()
    except PermissionError:
        print(f"[WARN]  Permission denied binding to HTTPS port {HTTPS_PORT} (requires sudo/admin).")
    except OSError as e:
        print(f"[WARN]  Could not bind HTTPS port {HTTPS_PORT}: {e}")


def http_server(port=4173):
    """Run an HTTP web server on non-privileged port (port 4173)."""
    try:
        server = http.server.HTTPServer(("0.0.0.0", port), InstallerHandler)
        print(f"[HTTP]  Direct Web Server listening on port {port}")
        server.serve_forever()
    except Exception as e:
        print(f"[WARN]  Could not bind HTTP port {port}: {e}")


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------

def main():
    local_ip = get_local_ip()

    print("\n=======================================================")
    print("  Nuvio TV - Hisense VIDAA OS Ready Server")
    print("=======================================================")
    print(f"  Local Machine IP: {local_ip}")
    print("-------------------------------------------------------")
    print("  METHOD 1 (Recommended & 100% Easiest):")
    print("  1. Open the TV Internet Browser (Globe icon in Apps).")
    print(f"  2. Go to: http://{local_ip}:4173/?wrapper=vidaa")
    print("  3. Bookmark it or Add to Speed Dial / Favorites!")
    print("-------------------------------------------------------")
    print("  METHOD 2 (Home Screen Launcher Icon):")
    print(f"  1. On TV, set DNS to: {local_ip}")
    print(f"  2. In TV Browser, go to: https://{SPOOF_DOMAIN}/install")
    print("  3. Click 'Install to TV Launcher'")
    print("  4. Set TV DNS back to Automatic and restart TV.")
    print("=======================================================\n")

    # Start Direct HTTP Server (port 4173) in background
    http_thread = threading.Thread(target=http_server, args=(4173,), daemon=True)
    http_thread.start()

    # Attempt DNS & HTTPS Server if permissions allow
    can_bind_privileged = True
    try:
        test_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        test_sock.bind(("0.0.0.0", DNS_PORT))
        test_sock.close()
    except Exception:
        can_bind_privileged = False

    if can_bind_privileged:
        tmp = tempfile.mkdtemp(prefix="nuvio_vidaa_installer_")
        cert_path = os.path.join(tmp, "cert.pem")
        key_path = os.path.join(tmp, "key.pem")

        print("[DNS/HTTPS] Generating self-signed SSL certificate...")
        generate_self_signed_cert(cert_path, key_path)

        dns_thread = threading.Thread(target=dns_server, args=(local_ip,), daemon=True)
        dns_thread.start()

        https_thread = threading.Thread(target=https_server, args=(cert_path, key_path), daemon=True)
        https_thread.start()
    else:
        print("[NOTICE] Running without root/admin privileges.")
        print("[NOTICE] Method 1 (Direct TV Browser port 4173) is ACTIVE and ready to use!")
        print("[NOTICE] (To use Method 2 DNS spoofing, re-run with 'sudo python3 server.py')\n")

    print("Server is active. Press Ctrl+C to stop.\n")

    try:
        signal.pause()
    except (AttributeError, KeyboardInterrupt):
        try:
            while True:
                threading.Event().wait(1)
        except KeyboardInterrupt:
            pass

    print("\nShutting down server.")


if __name__ == "__main__":
    main()
