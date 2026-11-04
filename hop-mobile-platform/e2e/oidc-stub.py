# Minimal OIDC discovery stub so the Hop API can start locally. Phone OTP is used for sign-in.
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
PORT = int(sys.argv[1])
ISS = f"http://127.0.0.1:{PORT}"
DOC = {"issuer": ISS, "authorization_endpoint": ISS + "/auth", "token_endpoint": ISS + "/token", "jwks_uri": ISS + "/jwks", "id_token_signing_alg_values_supported": ["RS256"], "response_types_supported": ["code"], "subject_types_supported": ["public"]}
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(DOC if self.path.startswith("/.well-known/openid-configuration") else {"keys": []}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", PORT), H).serve_forever()
