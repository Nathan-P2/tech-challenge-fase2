# Otimização de Rotas Hospitalares

Projeto 2 do Tech Challenge Fase 2. A solução usa algoritmo genético para distribuir medicamentos e insumos considerando distância, prioridade, capacidade de carga, autonomia e múltiplos veículos.

O algoritmo foi adaptado do projeto [sergiopolimante/genetic_algorithm_tsp](https://github.com/sergiopolimante/genetic_algorithm_tsp). Foram mantidos os conceitos de população de permutações, order crossover, mutação e elitismo. A modelagem hospitalar, as restrições e a divisão entre veículos foram implementadas neste projeto.

## Funcionalidades

- Otimização TSP/VRP com três veículos;
- Prioridades de entrega;
- Limites de carga e autonomia;
- Comparação com vizinho mais próximo;
- Mapa SVG e frontend interativo;
- Relatórios diário e semanal via OpenRouter;
- Perguntas em linguagem natural pelo terminal e frontend;
- Estimativa e comparação de tempo operacional;
- Histórico de até 30 execuções para identificar padrões;
- Métricas de distância, prioridade e ocupação da capacidade;
- Testes automatizados.

## Executar o Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
hospital-routes
```

Sem instalar o pacote:

```bash
PYTHONPATH=src python3 -m hospital_routes
```

A execução cria em `output/`:

- `routes.svg`: mapa das rotas;
- `summary.json`: métricas, comparação e sequência das entregas;
- `llm_prompt.txt`: prompt reproduzível;
- `report.txt`: instruções e resumo operacional.
- `run_history.json`: histórico compacto usado na análise de padrões.

## OpenRouter no terminal

```bash
pip install -e '.[llm]'
export OPENROUTER_API_KEY='sua-chave'
hospital-routes --llm
hospital-routes --llm --report-type weekly
hospital-routes --llm --question 'Qual entrega crítica deve sair primeiro?'
```

O modelo padrão é `openai/gpt-4o-mini` e pode ser alterado por `OPENROUTER_MODEL`. Nunca envie a chave ao Git.

## Executar o frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Preencha OPENROUTER_API_KEY em .env.local
npm run dev
```

Acesse `http://localhost:3000`. O frontend permite configurar o algoritmo, visualizar a geração selecionada, analisar a divisão entre veículos, comparar o tempo estimado, gerar relatórios diários ou semanais e fazer perguntas sobre a rota. O relatório semanal usa as execuções dos últimos sete dias. As últimas 30 execuções ficam no navegador e permitem que a LLM identifique tendências.

## Demonstração completa

O script executa três configurações do algoritmo e gera mapa, métricas, histórico e relatório semanal em `output/demo/`:

```bash
python3 scripts/demo.py
```

Para gerar o último relatório pela OpenRouter:

```bash
python3 scripts/demo.py --llm
```

## Testes

Python:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

Frontend:

```bash
cd frontend
npm test
```

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Relatório técnico](docs/relatorio-tecnico.md)
- [API do frontend](docs/api.md)

## Escopo

O projeto é executado localmente e não utiliza nuvem. Infraestrutura como código não se aplica ao escopo escolhido. As coordenadas e distâncias são fictícias e euclidianas. O tempo é uma estimativa baseada em velocidade média de 30 km/h e 8 minutos de atendimento por entrega; não representa trânsito real.
