# Conclusiones de recuperación RAG

- `local-957613c07305` recupera el chunk esperado entre los cinco primeros en 22 de 24 preguntas: **recall@5 = 0,9167**.
- El recall no cambia al ampliar de 5 a 10 resultados: **recall@10 = 1,0000**.
- La posición media recíproca es **MRR = 0,7125**.
- Hay 2 fallos de recall@5; su posición queda registrada en `results.json` y resumida en `results.md`.
- El benchmark evalúa recuperación, no la fidelidad de la respuesta generada por el LLM.
