import http.cookiejar
import os
from unittest.mock import patch
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer
import server


class AppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = patch.dict(os.environ, {'DEMO_PASSWORD':'', 'PUBLIC_ORIGIN':'', 'RENDER_EXTERNAL_URL':''})
        cls.env.start()
        cls.temp = tempfile.TemporaryDirectory()
        server.DB = Path(cls.temp.name) / 'test.sqlite3'
        server.init_db()
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.temp.cleanup()
        cls.env.stop()

    def client(self):
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call(client, '/api/state')
        return client

    def call(self, client, path, data=None):
        req = urllib.request.Request(self.base+path, data=None if data is None else json.dumps(data).encode(), headers={'Content-Type':'application/json'})
        try:
            with client.open(req) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def ride(self, client):
        return next(r for r in self.call(client, '/api/state')[1]['rides'] if r['mine'])

    def create(self, client):
        self.assertEqual(self.call(client, '/api/rides', {'pickup':'central','destination':'tnagar'})[0],201)
        return self.ride(client)

    def action(self, client, ride, action, **extra):
        return self.call(client, '/api/action', {'id':ride['id'],'action':action,**extra})[0]

    def test_full_lifecycle_and_authorization(self):
        rider, driver, stranger = self.client(), self.client(), self.client()
        ride = self.create(rider)
        self.assertEqual(self.action(rider, ride, 'accept'),400)
        self.assertEqual(self.action(stranger, ride, 'cancel'),400)
        self.assertEqual(self.action(driver, ride, 'accept'),200)
        self.assertEqual(self.action(stranger, ride, 'accept'),400)
        driver_ride = next(r for r in self.call(driver,'/api/state')[1]['rides'] if r['id']==ride['id'])
        self.assertNotIn('pin',driver_ride)
        self.assertEqual(self.action(driver,ride,'complete'),400)
        self.assertEqual(self.action(driver,ride,'arrive'),200)
        self.assertEqual(self.action(driver,ride,'start',pin='wrong'),400)
        self.assertEqual(self.action(driver,ride,'start',pin=ride['pin']),200)
        self.assertEqual(self.action(rider,ride,'cancel'),400)
        self.assertEqual(self.action(driver,ride,'complete'),200)
        self.assertEqual(self.ride(rider)['status'],'completed')
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT status FROM rides WHERE id=?',(ride['id'],)).fetchone()[0],'completed')

    def test_duplicate_request_and_cancel(self):
        rider=self.client()
        ride=self.create(rider)
        self.assertEqual(self.call(rider,'/api/rides',{'pickup':'central','destination':'marina'})[0],409)
        self.assertEqual(self.action(rider,ride,'cancel'),200)
        self.assertEqual(self.ride(rider)['status'],'cancelled')
        self.assertEqual(self.call(rider,'/api/rides',{'pickup':'central','destination':'marina'})[0],201)

    def test_only_one_active_driver_ride(self):
        driver=self.client()
        first=self.create(self.client())
        second=self.create(self.client())
        self.assertEqual(self.action(driver,first,'accept'),200)
        self.assertEqual(self.action(driver,second,'accept'),409)

    def test_quote_and_invalid_inputs(self):
        client=self.client()
        code, q=self.call(client,'/api/quote',{'pickup':'central','destination':'tnagar'})
        self.assertEqual(code,200)
        self.assertGreater(q['fare'],0)
        self.assertGreater(q['distance'],0)
        for data in [{'pickup':'central','destination':'central'},{'pickup':[], 'destination':'marina'},{'pickup':'unknown','destination':'marina'},[]]:
            self.assertEqual(self.call(client,'/api/quote',data)[0],400)
        self.assertEqual(self.call(urllib.request.build_opener(),'/api/rides',{})[0],401)

    def test_static_files(self):
        for path in ['/','/app.js','/style.css']:
            with urllib.request.urlopen(self.base+path) as response:
                self.assertEqual(response.status,200)
                self.assertTrue(response.read())
        self.assertEqual(self.call(self.client(),'/missing')[0],404)

if __name__=='__main__':
    unittest.main()
