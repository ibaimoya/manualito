# Conclusiones de recuperación RAG

- `local-0e66aad3326a` recupera el chunk esperado entre los cinco primeros en 20 de 24 preguntas: **recall@5 = 0,8333**.
- El recall no cambia al ampliar de 5 a 10 resultados: **recall@10 = 0,9583**.
- La posición media recíproca es **MRR = 0,6335**.
- Hay 4 fallos de recall@5; su posición queda registrada en `results.json` y resumida en `results.md`.
- El benchmark evalúa recuperación, no la fidelidad de la respuesta generada por el LLM.
