# Conclusiones de recuperación RAG

- `local-939812b83bbe` recupera el chunk esperado entre los cinco primeros en 19 de 24 preguntas: **recall@5 = 0,7917**.
- El recall no cambia al ampliar de 5 a 10 resultados: **recall@10 = 0,7917**.
- La posición media recíproca es **MRR = 0,4979**.
- Hay 5 fallos de recall@5; su posición queda registrada en `results.json` y resumida en `results.md`.
- El benchmark evalúa recuperación, no la fidelidad de la respuesta generada por el LLM.
