"""Create three disposable verified identities in an existing LOCAL hop-dev realm.
Requires HOP_DEV_ADMIN_PASSWORD, optionally HOP_DEV_ADMIN_USER. Never uses production URLs.
Writes generated credentials to ignored .local/e2e-users.json without printing values.
"""
import json
import os
from pathlib import Path
import secrets
import urllib.parse
import urllib.request

BASE = 'http://localhost:8180'
root = Path(__file__).resolve().parents[1]
local = root / '.local'
local.mkdir(mode=0o700, exist_ok=True)
target = local / 'e2e-users.json'
if target.exists():
    raise SystemExit('The local credential file already exists; preserve it or explicitly remove it before creating another test set.')
body = urllib.parse.urlencode({
    'client_id': 'admin-cli', 'username': os.environ.get('HOP_DEV_ADMIN_USER', 'local-admin'),
    'password': os.environ['HOP_DEV_ADMIN_PASSWORD'], 'grant_type': 'password',
}).encode()
with urllib.request.urlopen(BASE+'/realms/master/protocol/openid-connect/token', body, timeout=10) as response:
    token = json.load(response)['access_token']
users = {}
for role in ['rider', 'driver', 'operator']:
    username = 'e2e-'+role+'-'+secrets.token_hex(4)
    password = secrets.token_urlsafe(24)
    payload = {'username': username, 'email': username+'@example.invalid', 'firstName': role.title(),
               'lastName': 'Test', 'enabled': True, 'emailVerified': True,
               'credentials': [{'type': 'password', 'value': password, 'temporary': False}]}
    request = urllib.request.Request(BASE+'/admin/realms/hop-dev/users', data=json.dumps(payload).encode(),
                                     headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:
        assert response.status == 201
    users[role] = {'username': username, 'password': password}
with target.open('x') as file:
    file.write(json.dumps(users))
target.chmod(0o600)
print('Created disposable local test identities; credentials saved in .local/e2e-users.json.')
