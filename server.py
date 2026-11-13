#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""INEvolution - local knowledge graph server.

Serves the web client from ``web/``, lists Markdown content files in
``notes/`` and stores the v2 node tree in ``data/graph.json``.  Only the Python
standard library is required.

Usage::

    python server.py
    python server.py --host 0.0.0.0 --port 8080

Environment variables ``KG_HOST`` / ``KG_PORT`` are used as defaults.
"""

import argparse
import json
import mimetypes
import os
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NOTES_DIR = os.path.join(BASE_DIR, 'notes')
WEB_DIR = os.path.join(BASE_DIR, 'web')
DATA_DIR = os.path.join(BASE_DIR, 'data')
META_FILE = os.path.join(DATA_DIR, 'graph.json')

DEFAULT_META = {'version': 2, 'tree': [], 'links': []}
META_LOCK = threading.Lock()

CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.md': 'text/markdown; charset=utf-8',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
}


def ensure_directories():
    for directory in (NOTES_DIR, WEB_DIR, DATA_DIR):
        os.makedirs(directory, exist_ok=True)


def find_md_files():
    """Return Markdown content files below notes/, relative to notes/."""
    result = []
    for dirpath, dirnames, filenames in os.walk(NOTES_DIR):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith('.'))
        for filename in sorted(filenames):
            if filename.startswith('.') or not filename.lower().endswith('.md'):
                continue
            abs_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(abs_path, NOTES_DIR).replace(os.sep, '/')
            result.append({
                'id': rel_path,
                'filename': rel_path,
                'name': os.path.splitext(filename)[0],
            })
    return result


def load_meta():
    if not os.path.isfile(META_FILE):
        return dict(DEFAULT_META)
    try:
        with open(META_FILE, 'r', encoding='utf-8') as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            return dict(DEFAULT_META)
        data.setdefault('version', 2)
        data.setdefault('tree', [])
        data.setdefault('links', [])
        return data
    except (OSError, ValueError):
        return dict(DEFAULT_META)


def save_meta(meta):
    """Write metadata atomically so an interrupted save cannot corrupt it."""
    ensure_directories()
    tmp_path = META_FILE + '.tmp'
    with META_LOCK:
        with open(tmp_path, 'w', encoding='utf-8', newline='\n') as handle:
            json.dump(meta, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
        os.replace(tmp_path, META_FILE)


def safe_join(rel_path, base_dir):
    """Join a relative path to ``base_dir`` while blocking directory escapes."""
    if not isinstance(rel_path, str):
        return None
    rel_path = rel_path.replace('\\', '/').lstrip('/')
    if '\x00' in rel_path:
        return None
    if any(part == '..' for part in rel_path.split('/')):
        return None
    base_abs = os.path.abspath(base_dir)
    target = os.path.abspath(os.path.join(base_abs, rel_path))
    if target != base_abs and not target.startswith(base_abs + os.sep):
        return None
    return target


def sanitize_note_name(name):
    """Turn a user supplied title into a safe Markdown file name."""
    if not isinstance(name, str):
        return ''
    name = name.strip()
    if name.lower().endswith('.md'):
        name = name[:-3]
    for char in '\\/:*?"<>|\r\n\t':
        name = name.replace(char, '')
    name = ''.join(char for char in name if ord(char) >= 32)
    name = name.strip(' .')
    name = name[:80]
    if not name or name in ('.', '..') or name.startswith('.'):
        return ''
    reserved = {'CON', 'PRN', 'AUX', 'NUL'}
    reserved.update({'COM%d' % index for index in range(1, 10)})
    reserved.update({'LPT%d' % index for index in range(1, 10)})
    if name.upper() in reserved:
        return ''
    return name


def _clean_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or abs(number) > 1e6:
        return None
    return round(number, 2)


NODE_TYPES = {'galaxy', 'planet', 'sector', 'country', 'city'}


def sanitize_tree(raw_tree):
    """Validate the flat node tree sent by the client."""
    tree = []
    if not isinstance(raw_tree, list):
        return tree
    seen = set()
    for item in raw_tree[:50000]:
        if not isinstance(item, dict):
            continue
        node_id = item.get('id')
        if not isinstance(node_id, str) or not node_id or len(node_id) > 200 or node_id in seen:
            continue
        node_type = item.get('type')
        if node_type not in NODE_TYPES:
            continue
        name = item.get('name')
        name = name[:120] if isinstance(name, str) else ''
        parent = item.get('parent')
        if isinstance(parent, str) and parent:
            parent = parent[:200]
        else:
            parent = None
        color = item.get('color')
        color = color[:32] if isinstance(color, str) else '#8e9196'
        positions = {}
        for axis in ('x', 'y', 'z'):
            value = _clean_number(item.get(axis))
            positions[axis] = 0 if value is None else value
        md = item.get('md')
        if not isinstance(md, str):
            md = ''
        md = md[:300]
        if '..' in md.replace('\\', '/').split('/'):
            md = ''
        seen.add(node_id)
        tree.append({
            'id': node_id,
            'type': node_type,
            'name': name,
            'parent': parent,
            'color': color,
            'x': positions['x'],
            'y': positions['y'],
            'z': positions['z'],
            'md': md,
        })
    return tree


def sanitize_links(raw_links):
    links = []
    if not isinstance(raw_links, list):
        return links
    seen = set()
    for item in raw_links[:50000]:
        if not isinstance(item, dict):
            continue
        source = item.get('source')
        target = item.get('target')
        if not isinstance(source, str) or not isinstance(target, str) or not source or not target:
            continue
        source = source[:200]
        target = target[:200]
        if source == target:
            continue
        key = tuple(sorted((source, target)))
        if key in seen:
            continue
        seen.add(key)
        links.append({'source': source, 'target': target})
    return links


class Handler(BaseHTTPRequestHandler):
    server_version = 'INEvolution/0.5.0'

    def log_message(self, format, *args):
        # Keep the console clean; uncomment for request debugging.
        return

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path):
        try:
            with open(path, 'rb') as handle:
                data = handle.read()
        except (FileNotFoundError, IsADirectoryError, PermissionError):
            self.send_error(404, 'Not Found')
            return
        extension = os.path.splitext(path)[1].lower()
        content_type = CONTENT_TYPES.get(extension) or mimetypes.guess_type(path)[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)

        if path == '/api/files':
            self._send_json({'files': find_md_files(), 'meta': load_meta()})
            return

        if path == '/api/meta':
            self._send_json(load_meta())
            return

        if path == '/api/content':
            query = urllib.parse.parse_qs(parsed.query)
            rel_path = (query.get('path') or [''])[0]
            local_path = safe_join(rel_path, NOTES_DIR)
            if not rel_path or local_path is None or not os.path.isfile(local_path) \
                    or not local_path.lower().endswith('.md'):
                self._send_json({'ok': False, 'error': 'file not found'}, 404)
                return
            try:
                with open(local_path, 'r', encoding='utf-8') as handle:
                    content = handle.read()
            except UnicodeDecodeError:
                with open(local_path, 'r', encoding='utf-8', errors='replace') as handle:
                    content = handle.read()
            except OSError as exc:
                self._send_json({'ok': False, 'error': str(exc)}, 500)
                return
            self._send_json({
                'ok': True,
                'path': rel_path,
                'name': os.path.splitext(os.path.basename(local_path))[0],
                'content': content,
            })
            return

        # Static web client. Keep old /knowledge-graph.html links working.
        if path in ('/', '/index.html', '/knowledge-graph.html'):
            path = '/index.html'
        local_path = safe_join(path, WEB_DIR)
        if local_path is None:
            self.send_error(400, 'Bad Path')
            return
        if os.path.isdir(local_path):
            local_path = os.path.join(local_path, 'index.html')
        if os.path.isfile(local_path):
            self._send_file(local_path)
        else:
            self.send_error(404, 'Not Found')

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length > 0 else b''
        try:
            data = json.loads(raw.decode('utf-8')) if raw else {}
        except (ValueError, UnicodeDecodeError):
            self._send_json({'ok': False, 'error': 'invalid json'}, 400)
            return

        if path == '/api/meta':
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'bad body'}, 400)
                return
            meta = {
                'version': 2,
                'tree': sanitize_tree(data.get('tree')),
                'links': sanitize_links(data.get('links')),
            }
            try:
                save_meta(meta)
                self._send_json({'ok': True})
            except OSError as exc:
                self._send_json({'ok': False, 'error': str(exc)}, 500)
            return

        if path == '/api/delete':
            rel_path = data.get('path', '')
            local_path = safe_join(rel_path, NOTES_DIR)
            if not rel_path or local_path is None or not os.path.isfile(local_path):
                self._send_json({'ok': False, 'error': 'file not found'}, 404)
                return
            if not local_path.lower().endswith('.md'):
                self._send_json({'ok': False, 'error': 'only md allowed'}, 400)
                return
            try:
                os.remove(local_path)
                parent = os.path.dirname(local_path)
                while parent and parent != NOTES_DIR:
                    try:
                        os.rmdir(parent)
                    except OSError:
                        break
                    parent = os.path.dirname(parent)
                self._send_json({'ok': True})
            except OSError as exc:
                self._send_json({'ok': False, 'error': str(exc)}, 500)
            return

        if path == '/api/create':
            content = data.get('content', '')
            if not isinstance(content, str):
                content = ''
            raw_path = data.get('path')
            if isinstance(raw_path, str) and raw_path.strip():
                rel_path = raw_path.replace('\\', '/').lstrip('/')
                if not rel_path.lower().endswith('.md'):
                    self._send_json({'ok': False, 'error': '仅支持 .md 文件'}, 400)
                    return
                local_path = safe_join(rel_path, NOTES_DIR)
                if local_path is None:
                    self._send_json({'ok': False, 'error': 'invalid path'}, 400)
                    return
                if os.path.exists(local_path):
                    self._send_json({'ok': False, 'error': '内容文件已存在'}, 409)
                    return
                try:
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    with open(local_path, 'w', encoding='utf-8') as handle:
                        handle.write(content)
                    name = os.path.splitext(os.path.basename(local_path))[0]
                    self._send_json({
                        'ok': True, 'id': rel_path, 'filename': rel_path, 'name': name,
                    })
                except OSError as exc:
                    self._send_json({'ok': False, 'error': str(exc)}, 500)
                return

            name = sanitize_note_name(data.get('name', ''))
            if not name:
                self._send_json({'ok': False, 'error': '名称无效，请换一个名字'}, 400)
                return
            rel_path = name + '.md'
            local_path = safe_join(rel_path, NOTES_DIR)
            if local_path is None:
                self._send_json({'ok': False, 'error': 'invalid path'}, 400)
                return
            if os.path.exists(local_path):
                self._send_json({'ok': False, 'error': '同名笔记已存在'}, 409)
                return
            try:
                with open(local_path, 'w', encoding='utf-8') as handle:
                    handle.write(content)
                self._send_json({'ok': True, 'id': rel_path, 'filename': rel_path, 'name': name})
            except OSError as exc:
                self._send_json({'ok': False, 'error': str(exc)}, 500)
            return

        if path == '/api/save':
            rel_path = data.get('path', '')
            content = data.get('content', None)
            if content is None:
                self._send_json({'ok': False, 'error': 'content required'}, 400)
                return
            local_path = safe_join(rel_path, NOTES_DIR)
            if not rel_path or local_path is None or not local_path.lower().endswith('.md'):
                self._send_json({'ok': False, 'error': 'invalid path'}, 400)
                return
            try:
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                with open(local_path, 'w', encoding='utf-8') as handle:
                    handle.write(content)
                self._send_json({'ok': True})
            except OSError as exc:
                self._send_json({'ok': False, 'error': str(exc)}, 500)
            return

        self.send_error(404, 'Not Found')


def parse_port(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 8080


def main():
    parser = argparse.ArgumentParser(description='INEvolution knowledge graph server')
    parser.add_argument('--host', default=os.environ.get('KG_HOST', '127.0.0.1'),
                        help='bind address (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=parse_port(os.environ.get('KG_PORT', '8080')),
                        help='listen port (default: 8080)')
    args = parser.parse_args()

    ensure_directories()
    print('INEvolution server: http://%s:%d/' % (args.host, args.port))
    print('Notes directory: %s' % NOTES_DIR)
    print('Web directory:   %s' % WEB_DIR)
    print('Metadata file:   %s' % META_FILE)
    if not os.path.isfile(os.path.join(WEB_DIR, 'index.html')):
        print('WARNING: web/index.html is missing.')

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    main()
