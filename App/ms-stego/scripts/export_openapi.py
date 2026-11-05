import json
from pathlib import Path

from app.main import app


if __name__ == '__main__':
    output = Path(__file__).resolve().parents[2] / 'docs/contratos/openapi-stego.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
