# Arquitetura da solução

## Visão geral

O projeto possui um núcleo Python responsável pela otimização e um frontend local para configuração, visualização e consulta das rotas. Os dois fluxos usam o mesmo cenário hospitalar e a mesma função objetivo.

```mermaid
flowchart LR
    A[Entregas e veículos] --> B[População de cromossomos]
    B --> C[Seleção por torneio]
    C --> D[Order crossover]
    D --> E[Mutação por troca]
    E --> F[Decodificação em múltiplos veículos]
    F --> G[Fitness: distância + prioridade + restrições]
    G --> B
    G --> H[Melhor plano]
    H --> I[Mapa e métricas]
    I --> M[Histórico local de execuções]
    M --> J
    H --> J[Prompt estruturado]
    J --> K[OpenRouter]
    K --> L[Relatório ou resposta]
```

## Componentes

| Componente | Responsabilidade |
|---|---|
| `models.py` | Define depósito, entrega, veículo, rota e plano. |
| `data.py` | Fornece o cenário fictício reproduzível. |
| `optimizer.py` | Executa operadores genéticos, decodificação VRP e fitness. |
| `reporting.py` | Serializa métricas, cria prompts e chama a OpenRouter. |
| `visualization.py` | Produz o mapa SVG das rotas. |
| `cli.py` | Executa o fluxo completo e salva os artefatos em `output/`. |
| `frontend/app/page.tsx` | Executa a simulação visual e apresenta os resultados. |
| `frontend/app/api/report/route.ts` | Mantém a chave no servidor e intermedeia chamadas à OpenRouter. |
| `localStorage` / `run_history.json` | Mantêm até 30 execuções para comparação de padrões. |

## Fluxo do algoritmo

1. Cada indivíduo é uma permutação dos identificadores das entregas.
2. O decodificador percorre o cromossomo e distribui entregas entre os veículos.
3. Capacidade e autonomia são respeitadas quando possível; violações recebem penalidade alta.
4. A população é ordenada pelo fitness.
5. O elitismo preserva os melhores indivíduos.
6. Seleção por torneio, crossover e mutação geram a próxima população.
7. Ao final, o melhor plano é convertido em métricas, mapa e contexto para a LLM.

## Função objetivo

O problema é de minimização:

```text
fitness = distância_total
        + 4 × penalidade_de_prioridade
        + 1000 × excesso_de_carga
        + 1000 × excesso_de_autonomia
```

As penalidades altas tornam planos inviáveis muito menos competitivos. A prioridade é ponderada pela posição global da entrega, favorecendo medicamentos críticos mais cedo.

## Integração com LLM

O navegador envia o plano para `POST /api/report`. O endpoint monta um prompt com rotas, cargas, distâncias, prioridades, baseline, estimativa de tempo, até 30 execuções anteriores e pergunta opcional. A chave `OPENROUTER_API_KEY` permanece no servidor. A resposta em Markdown é renderizada pelo frontend sem injeção de HTML.

## Tempo e padrões

O tempo de cada rota soma deslocamento e atendimento:

```text
tempo_rota = distância / 30 km/h + 8 minutos × número de entregas
tempo_da_operação = maior tempo entre os veículos
economia = tempo_baseline - tempo_otimizado
```

Como os veículos operam em paralelo, o maior tempo de rota representa a conclusão estimada da operação. Um resultado negativo em `economia` indica tempo adicional. O histórico contém configuração, fitness, distância, prioridade, capacidade, tempo e economia. A LLM compara essas métricas para identificar tendências recorrentes.

## Decisões de implementação

- Distância euclidiana: suficiente para demonstrar o algoritmo sem depender de mapas externos.
- Dados fictícios: evitam tratamento de informações pessoais ou clínicas reais.
- Execução local: nuvem e infraestrutura como código estão fora do escopo escolhido.
- Semente configurável: permite repetir resultados e comparações.
- Vizinho mais próximo: fornece uma referência simples para avaliar o algoritmo genético.
- Relatório diário: distância, capacidade e tempo estimado são comparados com o baseline.
- Histórico limitado: somente as 30 execuções mais recentes são analisadas.
