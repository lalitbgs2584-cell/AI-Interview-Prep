import pypdf
import docx
import requests
from io import BytesIO
from config import settings

def download_resume(key: str) -> BytesIO:
    url = f"{settings.CDN_BASE_URL}/{key}"
    response = requests.get(url)
    response.raise_for_status()
    return BytesIO(response.content)



# usage
# text = read_resume("resumes/john_doe.pdf")