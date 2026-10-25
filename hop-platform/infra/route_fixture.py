"""Synthetic HTTP fixture for local browser tests. Not a production routing service."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# (name, city, lat, lng). Local development gazetteer; replace with a real geocoder in production.
PLACES = [
    ('MG Road', 'Bengaluru', 12.9759, 77.6060), ('Indiranagar', 'Bengaluru', 12.9716, 77.6412),
    ('Koramangala', 'Bengaluru', 12.9352, 77.6245), ('Whitefield', 'Bengaluru', 12.9698, 77.7500),
    ('Majestic Bus Stand', 'Bengaluru', 12.9770, 77.5726), ('Kempegowda Airport Road', 'Bengaluru', 13.1986, 77.7066),
    ('Electronic City', 'Bengaluru', 12.8452, 77.6602), ('HSR Layout', 'Bengaluru', 12.9116, 77.6474),
    ('Chennai Central', 'Chennai', 13.0827, 80.2707), ('T. Nagar', 'Chennai', 13.0418, 80.2341),
    ('Marina Beach', 'Chennai', 13.0500, 80.2824), ('Adyar', 'Chennai', 13.0012, 80.2565),
    ('Guindy', 'Chennai', 13.0067, 80.2206), ('Velachery', 'Chennai', 12.9815, 80.2180),
    ('Manapakkam', 'Chennai', 13.0200, 80.1815), ('Anna Nagar', 'Chennai', 13.0850, 80.2101),
    ('Chennai Airport', 'Chennai', 12.9941, 80.1709),
    ('Gateway of India', 'Mumbai', 18.9220, 72.8347), ('Bandra West', 'Mumbai', 19.0596, 72.8295),
    ('Andheri Station', 'Mumbai', 19.1197, 72.8464), ('Powai', 'Mumbai', 19.1176, 72.9060),
    ('Connaught Place', 'Delhi NCR', 28.6315, 77.2167), ('India Gate', 'Delhi NCR', 28.6129, 77.2295),
    ('Saket', 'Delhi NCR', 28.5245, 77.2066), ('Gurugram Cyber Hub', 'Delhi NCR', 28.4950, 77.0890),
    ('Charminar', 'Hyderabad', 17.3616, 78.4747), ('HITEC City', 'Hyderabad', 17.4435, 78.3772),
    ('Banjara Hills', 'Hyderabad', 17.4126, 78.4482), ('Secunderabad Station', 'Hyderabad', 17.4339, 78.5016),
    ('Shivajinagar', 'Pune', 18.5308, 73.8475), ('Koregaon Park', 'Pune', 18.5362, 73.8940),
    ('Hinjewadi', 'Pune', 18.5912, 73.7389), ('Howrah Station', 'Kolkata', 22.5839, 88.3426),
    ('Park Street', 'Kolkata', 22.5522, 88.3524), ('Salt Lake', 'Kolkata', 22.5867, 88.4171),
]

def haversine(a, b):
    from math import radians, sin, cos, asin, sqrt
    la1, lo1, la2, lo2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * asin(sqrt(h))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/route/'):
            route_path = self.path.split('?', 1)[0].rsplit('/', 1)[-1]
            points = [tuple(map(float, point.split(','))) for point in route_path.split(';')]
            coords, meters = [points[0]], 0.0
            for a, b in zip(points, points[1:]):
                middle = ((a[0] + b[0]) / 2 + 0.002, (a[1] + b[1]) / 2)
                coords += [middle, b]
                meters += haversine((a[1], a[0]), (b[1], b[0])) * 1.3
            meters = max(500, round(meters))
            data = {'code': 'Ok', 'routes': [{'distance': meters, 'duration': round(meters / 6.9),
                    'geometry': {'type': 'LineString', 'coordinates': coords}}]}
        else:
            params = parse_qs(urlparse(self.path).query)
            query = params.get('q', [''])[0].lower().strip()
            centre = (float(params.get('lat', ['0'])[0]), float(params.get('lon', ['0'])[0]))
            words = [w for w in query.replace(',', ' ').split() if w]
            def score(place):
                text = (place[0] + ' ' + place[1]).lower()
                return sum(w in text for w in words)
            ranked = sorted(PLACES, key=lambda p: (-score(p), haversine(centre, (p[2], p[3]))))
            hits = [p for p in ranked if score(p) > 0] or ranked
            hits = sorted(hits, key=lambda p: haversine(centre, (p[2], p[3])) if score(p) == 0 else -score(p))[:8]
            data = {'features': [{'geometry': {'coordinates': [p[3], p[2]]},
                                  'properties': {'name': p[0], 'city': p[1]}} for p in hits]}
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
