import base64
import json
import os
import secrets
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import server


class DeploymentTest(unittest.TestCase):
    def test_password_gate_https_origin_and_secure_cookie(self):
        original_db=server.DB
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {
            'DEMO_PASSWORD':secrets.token_urlsafe(24),
            'PUBLIC_ORIGIN':'https://demo.example.test',
        }):
            server.DB=Path(temp)/'test.sqlite3'
            server.init_db()
            http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            threading.Thread(target=http.serve_forever,daemon=True).start()
            base=f'http://127.0.0.1:{http.server_port}'
            auth='Basic '+base64.b64encode(('demo:'+os.environ['DEMO_PASSWORD']).encode()).decode()
            def request(path,headers=None,data=None):
                req=urllib.request.Request(base+path,headers=headers or {},data=data)
                try:
                    return urllib.request.urlopen(req)
                except urllib.error.HTTPError as e:
                    return e
            try:
                with request('/healthz') as r:self.assertEqual(r.status,200)
                for path in ['/','/app.js','/api/state']:
                    with request(path) as r:self.assertEqual(r.code,401)
                with request('/api/state',{'Authorization':auth}) as r:
                    self.assertEqual(r.status,200)
                    cookie=r.headers['Set-Cookie']
                    self.assertIn('; Secure',cookie)
                headers={'Authorization':auth,'Cookie':cookie.split(';')[0], 'Origin':'https://demo.example.test', 'Content-Type':'application/json'}
                body=json.dumps({'pickup':'central','destination':'tnagar'}).encode()
                with request('/api/quote',headers,body) as r:self.assertEqual(r.status,200)
                headers['Origin']='https://untrusted.example.test'
                with request('/api/quote',headers,body) as r:self.assertEqual(r.code,403)
            finally:
                http.shutdown()
                http.server_close()
                server.DB=original_db
