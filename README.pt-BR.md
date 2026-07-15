# Precifica Obra Core

Biblioteca TypeScript independente de framework para ler planilhas SINAPI fornecidas pelo usuário
e produzir cálculos reproduzíveis de custos de obras civis. O projeto extrai o núcleo de domínio de
uma aplicação de orçamentação utilizada internamente.

> Este projeto é independente e não possui vínculo ou endosso da CAIXA, do IBGE ou do Governo
> Federal. Nenhuma base SINAPI é redistribuída. O usuário deve obter os arquivos na fonte oficial e
> validar os resultados antes do uso profissional.

[Read in English](README.md)

## Objetivo

- Normalizar linhas de CSV/XLSX sem banco de dados ou framework web.
- Ler cabeçalhos e linhas para interfaces de pré-visualização com `readSinapiFile`.
- Manter separados os preços desonerado e não desonerado.
- Calcular materiais, mão de obra com encargos, equipamentos e composições.
- Calcular orçamento e BDI composto com aritmética decimal determinística.
- Informar erros por linha sem aceitar silenciosamente dados inválidos.

## Instalação

```bash
npm install precifica-obra-core
```

Requer Node.js 20 ou superior.

## Exemplo

```ts
import { calculateComposition, parseSinapiWorkbook } from 'precifica-obra-core'

const result = await parseSinapiWorkbook(fileBytes, {
  state: 'MG',
  referenceMonth: '2026-03',
  category: 'SINAPI_INSUMOS',
})

const composition = calculateComposition({
  code: 'EXEMPLO-1',
  description: 'Composição demonstrativa',
  unit: 'M2',
  items: [
    {
      code: 'MAT-1',
      description: 'Material',
      unit: 'KG',
      category: 'MATERIAL',
      coefficient: '2.5',
      unitPrice: '4.1234',
    },
  ],
})

console.log(result.diagnostics)
console.log(composition.directCost)
```

As saídas monetárias públicas usam strings com quatro casas decimais. Prefira strings também nas
entradas para preservar integralmente a precisão.

Cada total de linha de uma composição é calculado com a precisão integral das entradas e
arredondado uma única vez para quatro casas. Os totais por categoria e o custo direto somam esses
mesmos valores de linha já arredondados, de modo que os valores exibidos sempre fecham entre si.
Categorias e estratégias de duplicidade desconhecidas em tempo de execução são rejeitadas com
`ValidationError`.

## Fórmula de BDI

O cálculo usa:

```text
((1 + AC + S + G + R) × (1 + DF) × (1 + L) / (1 - I)) - 1
```

Os percentuais são informados como valores percentuais, por exemplo `5` para 5%.

## Desenvolvimento

```bash
npm ci
npm run validate
```

Consulte [CONTRIBUTING.md](CONTRIBUTING.md), [docs/API.md](docs/API.md) e
[docs/VALIDATION.md](docs/VALIDATION.md).

## Licença

[MIT](LICENSE) © 2026 Jonathan Carlos Nunes do Nascimento.
