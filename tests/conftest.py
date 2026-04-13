import sys
from pathlib import Path

# Añade backend/ocr al path para que los tests encuentren los módulos
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "ocr"))
