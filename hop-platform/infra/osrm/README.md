# Hop road router (OSRM sidecar)

Hop's routes, ETAs, route alternatives, captain turn-by-turn and the dispatcher's ETA table come from [OSRM](https://project-osrm.org). Instead of the public demo server (about 1 request per second, not for production apps), OSRM runs as a second container in the same Cloud Run service as the API. The API reaches it at `http://127.0.0.1:5000` and never leaves the instance.

- **Map data:** the Geofabrik South India extract (Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana, Puducherry) with the car profile. It covers Chennai, Bengaluru, Madurai and every catalogue district. Data © OpenStreetMap contributors, ODbL 1.0. Credit OpenStreetMap wherever routes are shown, for example on the app's licences screen.
- **Processing** happens when the image is built, so a starting container only loads ready files. It needs more than 7 GB of RAM, which is why Cloud Build uses a 32 GB machine. A laptop can test the Dockerfile with a small extract: `--build-arg PBF_URL=https://download.geofabrik.de/asia/bhutan-latest.osm.pbf`.
- **Memory:** the router is given 4 GB by default. After the first deploy, check its real use in Cloud Run metrics and lower `osrm_memory` if there's room.
- **Cold starts:** with `low_cost` (minimum 0 instances), the first request after idle waits while the router loads its files. Production keeps one instance warm.

## Build (only when you want fresher roads)

**From GitHub (recommended):** Actions → *Hop platform checks* → *Run workflow* on `master`, tick **Rebuild the road router image**. It builds in Cloud Build with the deploy account and tags the result `osrm:current`. That run doesn't deploy.

**By hand,** with an account that can use Cloud Build and Artifact Registry, from `hop-platform`:

```sh
gcloud builds submit infra/osrm --config=infra/osrm/cloudbuild.yaml \
  --substitutions=_REGION=asia-south1,_REPOSITORY=hop-containers,_DATA=$(date +%Y%m%d)
```

Then add the image to the deploy config (`deploy.local.json`, and the `HOP_DEPLOY_CONFIG` GitHub variable that CI uses):

```json
"osrm_image": "asia-south1-docker.pkg.dev/<project>/hop-containers/osrm:current",
"osrm_memory": "4Gi"
```

`deploy.py` pins the tag to its digest, deploys the router next to the API, sets `ROUTING_URL` to the sidecar, and makes the API container wait for the router's startup probe. Leave `osrm_image` out to keep using an external `ROUTING_URL`.

## Run locally

```sh
docker build -t hop-osrm:local infra/osrm
docker run --rm -p 5000:5000 hop-osrm:local
ROUTING_URL=http://127.0.0.1:5000 …   # start the API as usual
```
