# API do frontend

O frontend possui um único endpoint interno para transformar o plano de rotas em instruções ou responder perguntas em linguagem natural.

## `POST /api/report`

### Requisição

Header obrigatório:

```text
Content-Type: application/json
```

Corpo:

```json
{
  "plan": {
    "routes": [],
    "totalDistance": 79.33,
    "priorityPenalty": 75,
    "overload": 0,
    "autonomyExcess": 0,
    "fitness": 379.33,
    "feasible": true
  },
  "generation": 80,
  "baseline": {},
  "question": "Qual entrega crítica deve sair primeiro?"
}
```

| Campo | Obrigatório | Descrição |
|---|---:|---|
| `plan` | Sim | Melhor plano encontrado pelo algoritmo genético. |
| `plan.routes` | Sim | Rotas e entregas separadas por veículo. |
| `generation` | Não | Geração selecionada no frontend. |
| `baseline` | Não | Resultado da heurística do vizinho mais próximo. |
| `question` | Não | Pergunta de até 500 caracteres. Quando omitida, gera o relatório diário. |

### Resposta de sucesso

```json
{
  "report": "## Instruções por veículo...",
  "mode": "openrouter"
}
```

`mode` será `openrouter` quando a LLM for chamada e `demo` quando `OPENROUTER_API_KEY` não estiver configurada.

### Erros

| HTTP | Resposta | Causa |
|---:|---|---|
| 400 | `{"error":"JSON inválido"}` | Corpo não contém JSON válido. |
| 400 | `{"error":"O campo plan.routes é obrigatório"}` | Plano ausente ou incompleto. |
| 502 | `{"error":"Falha na OpenRouter"}` | OpenRouter recusou ou não concluiu a requisição. |
| 502 | `{"error":"Resposta vazia"}` | A LLM não devolveu conteúdo. |

### Configuração local

Crie `frontend/.env.local` a partir de `frontend/.env.example`. A chave permanece apenas no servidor e nunca é enviada ao navegador.
