from dotenv import load_dotenv
load_dotenv()
from core.config import settings

print(settings.VALKEY_HOST)