"""Servicio LLM de Manualito.

Encapsula la comunicación con Ollama para generar respuestas a partir de
una pregunta y un contexto recuperado por RAG, gestionando además la
descarga del modelo en VRAM cuando el sistema queda inactivo.
"""
