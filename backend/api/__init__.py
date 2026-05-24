"""Servicio gateway HTTP de Manualito.

Punto de entrada público de la plataforma: valida las peticiones de los
clientes, orquesta las llamadas a los servicios internos (OCR, RAG y LLM)
y unifica la traducción de errores internos a respuestas HTTP públicas.
"""
