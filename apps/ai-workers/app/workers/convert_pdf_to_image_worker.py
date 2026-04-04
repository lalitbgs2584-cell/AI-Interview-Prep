import base64
from openai import OpenAI
from app.core.config import settings
from app.core.token_budget import (
    BudgetExceededError,
    check_budget,
    estimate_tokens,
    extract_total_tokens,
    increment_usage,
)

client = OpenAI(
    api_key=settings.OPENAI_API_KEY
)

def ocr_images_with_openai(page_images: list[bytes], user_id: str) -> str:
    extracted_pages = []
    model_name = "gpt-4o-mini"

    for img_bytes in page_images:
        check_budget(user_id, model_name)
        base64_image = base64.b64encode(img_bytes).decode("utf-8")

        response = client.responses.create(
            model=model_name,  # vision-capable + cost efficient
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Extract all readable text from this image. Return plain text only."
                        },
                        {
                            "type": "input_image",
                            "image_url": f"data:image/png;base64,{base64_image}"
                        }
                    ]
                }
            ],
        )

        page_text = response.output_text
        used_tokens = extract_total_tokens(response, estimate_tokens(page_text))
        increment_usage(user_id, model_name, used_tokens)
        extracted_pages.append(page_text)

    return "\n\n".join(extracted_pages)
