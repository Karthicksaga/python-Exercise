FROM golang:1.27.3-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /api ./cmd/api
FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
WORKDIR /app
COPY --from=build /api ./api
COPY --from=build /src/migrations ./migrations
ENV ADDRESS=:8080
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app/api"]
