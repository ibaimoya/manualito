"""Servicio LLM de Manualito.

Encapsula la comunicación con Ollama para generar respuestas a partir de
una pregunta y un contexto recuperado por RAG. El servicio puede precargar el
modelo al arrancar para evitar que la primera pregunta pague la carga en VRAM.
"""
