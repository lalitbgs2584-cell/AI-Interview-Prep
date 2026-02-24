import docx
import pypdf
from app.core.s3_client import download_resume

def read_resume(key: str) -> str:
    buffer = download_resume(key)
    
    if key.endswith('.pdf'):
        reader = pypdf.PdfReader(buffer)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    
    elif key.endswith('.docx'):
        doc = docx.Document(buffer)
        return "\n".join(para.text for para in doc.paragraphs)
    
    else:
        raise ValueError(f"Unsupported file type: {key}")