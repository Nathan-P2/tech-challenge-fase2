# Rota Gen - Frontend

Interface local para configurar o algoritmo genético, visualizar as rotas e consultar os resultados em linguagem natural.

## Executar

```bash
npm install
cp .env.example .env.local
npm run dev
```

Acesse `http://localhost:3000`.

## OpenRouter

Informe `OPENROUTER_API_KEY` em `.env.local`. O arquivo é ignorado pelo Git. O modelo pode ser alterado por `OPENROUTER_MODEL`.

O botão de relatório gera instruções diárias. O campo de pergunta responde dúvidas específicas sobre entregas, prioridades e veículos. O frontend estima o tempo usando 30 km/h e 8 minutos por entrega e guarda até 30 execuções no `localStorage` para que a LLM identifique padrões. Sem chave, o sistema usa apenas um texto demonstrativo.

## Validar

```bash
npm test
```

O frontend faz parte de uma solução local. Nuvem e infraestrutura como código não estão no escopo do projeto.
