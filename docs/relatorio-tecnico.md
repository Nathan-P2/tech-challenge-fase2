# Relatório técnico - Projeto 2

## 1. Objetivo

O sistema otimiza a distribuição de medicamentos e insumos entre unidades hospitalares e atendimentos domiciliares. A solução amplia o TSP para um cenário de múltiplos veículos, considerando prioridade, carga e autonomia, e usa uma LLM para transformar o plano em instruções operacionais.

## 2. Adaptação do código-base

O ponto de partida conceitual foi `sergiopolimante/genetic_algorithm_tsp`. Foram preservados população de permutações, elitismo, order crossover e mutação. A modelagem hospitalar, a divisão da sequência entre veículos, as restrições, a comparação, os artefatos e a integração com LLM foram implementados neste projeto.

## 3. Cenário utilizado

- Um depósito: Hospital Central;
- Dez entregas fictícias;
- Prioridades 1, 2 e 3, sendo 3 crítica;
- Três veículos;
- Capacidade máxima de 12 unidades por veículo;
- Autonomia máxima de 30 km por veículo;
- Coordenadas fictícias e distância euclidiana.

## 4. Algoritmo genético

### Representação

O cromossomo é uma permutação dos dez identificadores de entrega. Cada identificador aparece exatamente uma vez. O depósito não é gene porque todos os veículos saem e retornam ao Hospital Central.

### População e seleção

A população inicial contém permutações aleatórias e uma solução produzida pela heurística do vizinho mais próximo. A seleção ocorre por torneio de até quatro indivíduos, escolhendo o de menor fitness.

### Crossover, mutação e elitismo

O order crossover preserva um trecho do primeiro pai e completa o filho com genes do segundo sem duplicações. A mutação troca duas posições conforme a probabilidade configurada. O elitismo copia os melhores indivíduos para a geração seguinte.

### Decodificação e restrições

O cromossomo é percorrido na ordem dos genes. O decodificador adiciona entregas ao veículo atual enquanto carga e autonomia permitirem e avança para o próximo veículo quando necessário. Caso não exista alternativa viável, a violação é medida e penalizada no fitness.

### Função fitness

```text
fitness = distância total
        + 4 × penalidade de prioridade
        + 1000 × sobrecarga
        + 1000 × excesso de autonomia
```

Valores menores são melhores. A penalidade de prioridade cresce quando entregas críticas aparecem mais tarde.

## 5. Resultados e comparação

A referência é a heurística do vizinho mais próximo. Com população 120, 250 gerações, mutação 0,25 e semente 42:

| Métrica | Vizinho mais próximo | Algoritmo genético | Diferença |
|---|---:|---:|---:|
| Fitness | 434,92 | 379,33 | -55,59 |
| Distância total | 78,92 km | 79,33 km | +0,42 km |
| Penalidade de prioridade | 89 | 75 | -14 |
| Sobrecarga | 0 | 0 | 0 |
| Excesso de autonomia | 0 km | 0 km | 0 km |

O algoritmo aceitou 0,42 km adicionais para antecipar entregas críticas e reduzir o fitness total. O plano final permaneceu viável. Os valores completos e o histórico por geração ficam em `output/summary.json`.

## 6. Uso de recursos

O relatório utiliza dois indicadores mensuráveis:

- Distância total, usada como aproximação do consumo operacional;
- Ocupação da capacidade, calculada por `carga total / capacidade total`.

Economia de tempo não é calculada porque o cenário não possui duração de deslocamento, trânsito ou janelas de atendimento. A LLM é instruída a declarar essa limitação e não inventar valores.

## 7. Integração com LLM

A OpenRouter é acessada com o modelo configurado em `OPENROUTER_MODEL`, usando `openai/gpt-4o-mini` como padrão. O prompt inclui:

- Papel de coordenação logística hospitalar;
- Significado da prioridade crítica;
- Plano otimizado e baseline;
- Carga, capacidade, distância e restrições;
- Proibição de inventar ruas, horários, durações ou valores;
- Solicitação de instruções, relatório diário e melhorias;
- Pergunta opcional em linguagem natural.

O terminal aceita `--question`. O frontend também possui um campo de pergunta e usa o endpoint documentado em `docs/api.md`. Sem chave, o modo demonstração mantém o restante do fluxo utilizável, mas não representa uma resposta da LLM.

## 8. Visualização

O projeto gera `output/routes.svg` e apresenta um mapa interativo no frontend. Cada veículo recebe uma cor, as entregas são identificadas no mapa e as métricas mostram distância, carga, fitness, prioridade e melhoria contra a referência.

## 9. Testes

Os testes Python validam:

- Preservação da permutação no crossover e na mutação;
- Visita única a todas as entregas;
- Elitismo;
- Existência de solução viável;
- Penalização de sobrecarga;
- Penalização de excesso de autonomia;
- Divisão entre veículos;
- Prioridade crítica;
- Prompt, relatório, métricas de recursos, SVG e configuração OpenRouter.

Os testes do frontend validam build, renderização em português, integração com `/api/report`, campo de perguntas e renderização segura de Markdown.

## 10. Organização e execução

O pacote Python usa a estrutura `src/`, configuração em `pyproject.toml`, ambiente virtual `venv` e comando `hospital-routes`. O frontend fica em `frontend/`, possui configuração própria e é executado localmente. A arquitetura detalhada está em `docs/arquitetura.md`.

## 11. Limitações

- Coordenadas e demandas são fictícias;
- Distâncias são euclidianas e não representam ruas ou trânsito;
- Não existem janelas de horário;
- Não há cálculo de tempo economizado;
- O relatório é diário, não agrega histórico semanal;
- Nuvem e infraestrutura como código não fazem parte do escopo.

Essas limitações mantêm o projeto reproduzível e concentram a entrega nos requisitos obrigatórios do algoritmo genético, restrições, visualização, testes e integração com LLM.
