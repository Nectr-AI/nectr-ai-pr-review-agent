from pydantic_settings import BaseSettings
from typing import Optional
from dotenv import load_dotenv

# Load .env FIRST, with override=True so .env values beat empty system env vars
load_dotenv(override=True)


class Settings(BaseSettings):
    #App
    APP_NAME: str = "DevCopilot"
    APP_ENV: str = "development"
    APP_VERSION: str = "0.2.0"
    DEBUG:bool =True
    LOG_LEVEL: str = "DEBUG"
    

    #server
    HOST : str ="0.0.0.0"
    PORT :int = 8000

    #Database

    DATABASE_URL : str = "sqlite+aiosqlite:///./devcopilot.db"  


    #Anthropic
    ANTHROPIC_API_KEY : Optional[str] = None
    ANTHROPIC_MODEL : str = "claude-sonnet-4-5-20250929"

    #Github
    GITHUB_PAT : Optional[str] = None
    GITHUB_WEBHOOK_SECRET : Optional[str] = None

    #Metorial MCP
    METORIAL_API_KEY : Optional[str] = None
    GITHUB_MCP_DEPLOYMENT_ID : Optional[str] = None

    #Mem0
    MEM0_API_KEY: Optional[str] = None

    #Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USERNAME: str = "neo4j"
    NEO4J_PASSWORD: Optional[str] = None

    #slack
    SLACK_BOT_TOKEN : Optional[str] = None
    SLACK_SIGNING_SECRET : Optional[str] = None

    #Jwt AUth
    SECRET_KEY : str = "your-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES : int =1440

    model_config = {"env_file": ".env", "case_sensitive": True, "extra": "ignore"}

    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"
    ALGORITHM: str = "HS256"


settings= Settings()


   

