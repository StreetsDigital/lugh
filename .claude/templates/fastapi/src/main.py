"""
{{NAME}} - {{DESCRIPTION}}
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


# Configuration
class Settings(BaseSettings):
    """Application settings."""
    app_name: str = "{{NAME}}"
    debug: bool = False
    
    class Config:
        env_prefix = "{{NAME_UPPER}}_"


settings = Settings()


# Models
class HealthResponse(BaseModel):
    status: str = "ok"
    service: str


class ExampleRequest(BaseModel):
    message: str = Field(..., description="The message to process")


class ExampleResponse(BaseModel):
    result: str
    original: str


# Lifespan (startup/shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"Starting {settings.app_name}")
    yield
    # Shutdown
    print(f"Shutting down {settings.app_name}")


# Create app
app = FastAPI(
    title="{{NAME}}",
    description="{{DESCRIPTION}}",
    version="1.0.0",
    lifespan=lifespan,
)


# Routes
@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(status="ok", service=settings.app_name)


@app.post("/example", response_model=ExampleResponse)
async def example(request: ExampleRequest):
    """Example endpoint."""
    # TODO: Implement your logic here
    return ExampleResponse(
        result=f"Processed: {request.message}",
        original=request.message,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
