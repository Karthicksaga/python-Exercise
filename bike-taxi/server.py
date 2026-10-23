"""Local bike taxi demo. Python standard library only."""
import base64
import binascii
import hmac
import json
import math
import os
import secrets
import sqlite3
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
DB = Path(os.environ.get('BIKE_TAXI_DB', str(ROOT / 'rides.sqlite3')))
PLACES = {
    'central': {'name': 'Chennai Central', 'lat': 13.0827, 'lng': 80.2707},
    'marina': {'name': 'Marina Beach', 'lat': 13.0500, 'lng': 80.2824},
    'tnagar': {'name': 'T. Nagar', 'lat': 13.0418, 'lng': 80.2341},
    'adyar': {'name': 'Adyar', 'lat': 13.0067, 'lng': 80.2578},
    'guindy': {'name': 'Guindy', 'lat': 13.0067, 'lng': 80.2206},
    'anna': {'name': 'Anna Nagar', 'lat': 13.0850, 'lng': 80.2101},
}
ACTIVE = ('requested', 'accepted', 'arrived', 'in_progress')


def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS rides (
            id TEXT PRIMARY KEY, rider TEXT NOT NULL, driver TEXT,
            pickup TEXT NOT NULL, destination TEXT NOT NULL,
            distance REAL NOT NULL, fare INTEGER NOT NULL,
            status TEXT NOT NULL, pin TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )''')
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_rider_active ON rides(rider) WHERE status IN ('requested','accepted','arrived','in_progress')")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_driver_active ON rides(driver) WHERE status IN ('accepted','arrived','in_progress')")


def quote(pickup, destination):
    if pickup not in PLACES or destination not in PLACES or pickup == destination:
        raise ValueError('Choose two different locations.')
    a, b = PLACES[pickup], PLACES[destination]
    lat1, lat2 = math.radians(a['lat']), math.radians(b['lat'])
    dlat, dlon = lat2-lat1, math.radians(b['lng']-a['lng'])
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    km = round(6371 * 2 * math.atan2(math.sqrt(h), math.sqrt(1-h)) * 1.3, 1)
    return {'distance': km, 'fare': max(25, round(15 + km * 8)), 'minutes': max(5, round(km * 4))}


def serialize(row, viewer):
    result = dict(row)
    result['mine'] = result['rider'] == viewer
    result['driving'] = result['driver'] == viewer
    if not result['mine']:
        result.pop('pin')
    result.pop('rider')
    result.pop('driver')
    return result


class Handler(BaseHTTPRequestHandler):
    def authorized(self):
        password = os.environ.get('DEMO_PASSWORD', '')
        if not password:
            return True
        try:
            scheme, encoded = self.headers.get('Authorization', '').split(' ', 1)
            decoded = base64.b64decode(encoded, validate=True).decode('utf-8')
            username, supplied = decoded.split(':', 1)
            valid = (scheme.lower() == 'basic' and
                     hmac.compare_digest(username.encode(), b'demo') and
                     hmac.compare_digest(supplied.encode(), password.encode()))
        except (ValueError, UnicodeError, binascii.Error):
            valid = False
        if valid:
            return True
        body = b'Demo login required.'
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="Hop private demo", charset="UTF-8"')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
        return False

    def respond(self, status, value, cookie=None):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if cookie:
            self.send_header('Set-Cookie', f'demo_session={cookie}; HttpOnly; SameSite=Strict; Path=/' + ('; Secure' if os.environ.get('PUBLIC_ORIGIN', '').startswith('https://') or os.environ.get('RENDER_EXTERNAL_URL', '').startswith('https://') else ''))
        self.end_headers()
        self.wfile.write(body)

    def session(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie['demo_session'].value
            if len(token) == 48 and all(c in '0123456789abcdef' for c in token):
                return token
        except (KeyError, ValueError):
            pass
        return None

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/healthz':
            self.respond(200, {'ok': True})
            return
        if not self.authorized():
            return
        if path == '/api/state':
            token = self.session() or secrets.token_hex(24)
            with connect() as db:
                rows = db.execute("SELECT * FROM rides WHERE rider=? OR driver=? OR status='requested' ORDER BY created_at DESC LIMIT 100", (token, token)).fetchall()
            self.respond(200, {'places': PLACES, 'rides': [serialize(r, token) for r in rows], 'demo': True}, token)
            return
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}
        if path not in files:
            self.respond(404, {'error': 'Not found'})
            return
        filename, content_type = files[path]
        body = (ROOT / 'static' / filename).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self.authorized():
            return
        origin = (os.environ.get('PUBLIC_ORIGIN') or os.environ.get('RENDER_EXTERNAL_URL') or 'http://' + self.headers.get('Host', '')).rstrip('/')
        if self.headers.get('Origin') and self.headers['Origin'] != origin:
            self.respond(403, {'error': 'Cross-origin requests are not allowed.'})
            return
        token = self.session()
        if not token:
            self.respond(401, {'error': 'Refresh the page to start a demo session.'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 1 or size > 4096:
                raise ValueError('Invalid request size.')
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('Expected a JSON object.')
            path = self.path
            if path in ('/api/quote', '/api/rides'):
                pickup, destination = data.get('pickup'), data.get('destination')
                if not isinstance(pickup, str) or not isinstance(destination, str):
                    raise ValueError('Choose pickup and destination.')
                estimate = quote(pickup, destination)
                if path == '/api/quote':
                    self.respond(200, estimate)
                    return
                with connect() as db:
                    db.execute('INSERT INTO rides(id,rider,pickup,destination,distance,fare,status,pin) VALUES(?,?,?,?,?,?,?,?)',
                               (secrets.token_hex(6), token, pickup, destination, estimate['distance'], estimate['fare'], 'requested', str(secrets.randbelow(9000)+1000)))
                self.respond(201, {'ok': True})
                return
            if path == '/api/action':
                with connect() as db:
                    db.execute('BEGIN IMMEDIATE')
                    ride = db.execute('SELECT * FROM rides WHERE id=?', (data.get('id'),)).fetchone()
                    if not ride:
                        self.respond(404, {'error': 'Ride not found.'})
                        return
                    action = data.get('action')
                    if action == 'accept' and ride['status'] == 'requested':
                        if ride['rider'] == token:
                            raise ValueError('Open a separate browser or private window to act as the driver.')
                        db.execute("UPDATE rides SET driver=?,status='accepted' WHERE id=?", (token, ride['id']))
                    elif action == 'cancel' and ride['rider'] == token and ride['status'] in ('requested','accepted','arrived'):
                        db.execute("UPDATE rides SET status='cancelled' WHERE id=?", (ride['id'],))
                    elif ride['driver'] == token and (ride['status'], action) in (('accepted','arrive'),('arrived','start'),('in_progress','complete')):
                        if action == 'start' and str(data.get('pin', '')) != ride['pin']:
                            raise ValueError('Pickup code does not match. Ask the rider for their code.')
                        status = {'arrive':'arrived','start':'in_progress','complete':'completed'}[action]
                        db.execute('UPDATE rides SET status=? WHERE id=?', (status, ride['id']))
                    else:
                        raise ValueError('This action is not available. Refresh and try again.')
                self.respond(200, {'ok': True})
                return
            self.respond(404, {'error': 'Not found'})
        except sqlite3.IntegrityError:
            self.respond(409, {'error': 'You already have an active ride. Finish or cancel it first.'})
        except (ValueError, TypeError, sqlite3.InterfaceError, sqlite3.ProgrammingError) as exc:
            self.respond(400, {'error': str(exc) if isinstance(exc, ValueError) else 'Invalid request.'})


if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    if host != '127.0.0.1' and len(os.environ.get('DEMO_PASSWORD', '')) < 16:
        raise SystemExit('Set DEMO_PASSWORD to at least 16 characters before exposing the demo.')
    init_db()
    port = int(os.environ.get('PORT', '8000'))
    print(f'Bike taxi demo listening on port {port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
