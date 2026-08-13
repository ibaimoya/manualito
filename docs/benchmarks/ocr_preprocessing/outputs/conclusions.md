# Conclusiones OCR/preprocesado

- Para **Tesseract**, la técnica recomendada es **Resize x2.5 + grises** (`factor=2.5, INTER_CUBIC`), con -0.1418 CER frente a baseline.
- Para **PaddleOCR CPU**, la técnica recomendada es **CLAHE c=1 t=16** (`clip=1, tile=16x16`), con -0.0728 CER frente a baseline.
- Para **PaddleOCR GPU**, la técnica recomendada es **CLAHE c=1 t=16** (`clip=1, tile=16x16`), con -0.0553 CER frente a baseline.
