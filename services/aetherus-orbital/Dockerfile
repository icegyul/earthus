FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    nodejs \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m playwright install --with-deps chromium

# Application code
COPY pyproject.toml ./
COPY backend/ ./backend/
COPY packages/ ./packages/
COPY services/ ./services/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY contracts/ ./contracts/
COPY openapi/ ./openapi/
COPY db/ ./db/
COPY fixtures/ ./fixtures/
COPY providers/ ./providers/
COPY capabilities/ ./capabilities/
COPY models/ ./models/
COPY events/ ./events/
COPY visual/ ./visual/
COPY security/ ./security/
COPY migrations/ ./migrations/
COPY quality/ ./quality/
COPY tests/ ./tests/
COPY frontend/ ./frontend/
COPY artifacts/ ./artifacts/
COPY pytest.ini ./

# Evidence directory
RUN mkdir -p var/artifacts/evidence var/artifacts/raw var/raw

ENV PYTHONPATH=/app:/app/packages/domain:/app/packages/intelligence:/app/packages/foundation:/app/packages/space:/app/packages/control:/app/packages/orbit:/app/packages/visual:/app/packages/llm:/app/packages/platform:/app/packages/providers:/app/packages/product:/app/packages/integration
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "services.api.integrated:app", "--host", "0.0.0.0", "--port", "8000"]
