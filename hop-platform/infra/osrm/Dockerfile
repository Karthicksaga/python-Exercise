# Hop's own road router (OSRM), deployed as a sidecar of the API on Cloud Run (see README.md).
# The map is processed at build time, so the container only loads ready files when it starts.
ARG OSRM=ghcr.io/project-osrm/osrm-backend:v5.27.1

FROM ${OSRM} AS build
# Geofabrik extract. South India covers Tamil Nadu, Karnataka, Kerala, Andhra Pradesh,
# Telangana and Puducherry. Map data (c) OpenStreetMap contributors, ODbL 1.0.
ARG PBF_URL=https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf
WORKDIR /data
ADD ${PBF_URL} /data/region.osm.pbf
# MLD keeps preprocessing light and supports alternatives and the table API the dispatcher uses.
# Fewer threads use less memory; raise THREADS on a big build machine.
ARG THREADS=2
RUN osrm-extract --threads ${THREADS} -p /opt/car.lua /data/region.osm.pbf \
 && osrm-partition --threads ${THREADS} /data/region.osrm \
 && osrm-customize --threads ${THREADS} /data/region.osrm \
 && rm /data/region.osm.pbf

FROM ${OSRM}
COPY --from=build /data /data
EXPOSE 5000
# --max-table-size covers the dispatcher's nearby-captain ETA table; alternatives back route choice.
CMD ["osrm-routed", "--algorithm", "mld", "--ip", "0.0.0.0", "--port", "5000", "--max-table-size", "500", "--max-alternatives", "3", "/data/region.osrm"]
