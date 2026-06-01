# Kinetic Vault Backend

Spring Boot backend for Kinetic Vault. This service is deployable as an independent Render web service from this directory.

## Required Environment Variables

Set these in Render Dashboard > Service > Environment:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB Atlas SRV connection string, including database name, for example `mongodb+srv://user:password@cluster.example.mongodb.net/kineticvault?retryWrites=true&w=majority`. |
| `AI_GATEWAY_TOKEN` | Yes | MIET AI Gateway bearer token. The app falls back to local rules if omitted, but AI analysis requires it. |
| `APP_CORS_ALLOWED_ORIGINS` | Yes | Comma-separated frontend origins. Use your deployed app domains in production. |
| `AI_GATEWAY_URL` | No | Defaults to `https://ai-services.mietjmu.in/gateway/llm/chat`. |
| `AI_GATEWAY_MODEL` | No | Defaults to `gpt-oss:20b`. |
| `MONGODB_VERIFY_ON_STARTUP` | No | Defaults to `true`; pings MongoDB during startup and fails fast when Atlas is unreachable. |
| `MONGODB_AUTO_INDEX_CREATION` | No | Defaults to `true`. |
| `TESSERACT_DATA_PATH` | No | Defaults to `/usr/share/tesseract-ocr/5/tessdata` in the Docker image. |
| `MAX_FILE_SIZE` | No | Defaults to `10MB`. |
| `MAX_REQUEST_SIZE` | No | Defaults to `10MB`. |

Do not add `PORT` manually unless you need to override Render's port. The app reads `server.port=${PORT:8080}`.

## Render Deployment

Current Render native runtimes do not include Java, so this backend deploys with Docker. The included `render.yaml` uses:

```yaml
services:
  - type: web
    name: kineticvault-backend
    runtime: docker
    dockerfilePath: ./Dockerfile
    dockerContext: .
    dockerCommand: java -jar /app/app.jar
    healthCheckPath: /api/health
```

Deployment steps:

1. Push this backend directory with `Dockerfile`, `render.yaml`, and `src/main/resources/application.properties`.
2. In Render, create a Blueprint from `kineticvault-backend/render.yaml`, or create a Web Service with root directory set to `kineticvault-backend`.
3. Add the required environment variables above. Values marked `sync: false` in `render.yaml` are prompted in the Dashboard and are not stored in source control.
4. Deploy. Render builds the Docker image, starts `java -jar /app/app.jar`, and checks `/api/health`.

## MongoDB Atlas Setup

1. Create a MongoDB Atlas cluster.
2. Create a database user with read/write access to the `kineticvault` database.
3. Add an Atlas Network Access rule that permits your Render service. For a quick first deploy you can allow `0.0.0.0/0`; for production, restrict access to Render outbound IPs or a dedicated/static outbound IP option available to your Render plan.
4. Copy the Atlas SRV URI and include the database name:

```text
mongodb+srv://<username>:<password>@<cluster-host>/kineticvault?retryWrites=true&w=majority
```

5. Add that value to Render as `MONGODB_URI`.

Spring Boot 4 reads the URI from `spring.mongodb.uri=${MONGODB_URI}`. The legacy `spring.data.mongodb.uri=${MONGODB_URI}` key is also present for compatibility with Spring Boot 3 tooling.

## Local Build

```bash
mvn clean package -DskipTests
java -jar target/app.jar
```

For local runs, set `MONGODB_URI`, `AI_GATEWAY_TOKEN`, and `APP_CORS_ALLOWED_ORIGINS` in your shell or IDE run configuration. Keep local `.env` files and profile-specific secret properties out of source control.

## Docker Build (Local Testing)

To test the Render deployment environment locally, you can build and run the Docker image:

```bash
docker build -t kineticvault-backend .
docker run -p 8080:8080 \
  -e MONGODB_URI="<your_mongodb_uri>" \
  -e AI_GATEWAY_TOKEN="<your_token>" \
  -e APP_CORS_ALLOWED_ORIGINS="*" \
  kineticvault-backend
```

## Troubleshooting

- **MongoDB Timeout during startup:** Ensure that you have added `0.0.0.0/0` (or Render's outbound IPs) to your MongoDB Atlas Network Access rules. The application will log `MongoDB Connection: FAILED` if it cannot reach the database.
- **Tesseract Not Found:** The Dockerfile automatically installs Tesseract. If running locally outside Docker, you must install Tesseract-OCR manually and set `TESSERACT_DATA_PATH` to point to the `tessdata` folder.
- **Render Deployment Fails to Start:** Check the Render Logs. Ensure all required Environment Variables are populated. The Health Check path is `/api/health` and expects an HTTP 200 response.
