"""Synthetic HTTP fixture for local browser tests. Not a production routing service."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/route/'):
            data = {'code': 'Ok', 'routes': [{'distance': 5200, 'duration': 1200}]}
        else:
            query = parse_qs(urlparse(self.path).query).get('q', [''])[0]
            pickup = 'central' in query.lower()
            data = {'features': [{'geometry': {'coordinates': [80.2707, 13.0827] if pickup else [80.2341, 13.0418]},
                                  'properties': {'name': 'Chennai Central' if pickup else 'T. Nagar', 'city': 'Chennai'}}]}
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8191), Handler).serve_forever()
