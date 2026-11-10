# Privacidade e tratamento de dados

> Rascunho técnico. **Não** declara conformidade com a LGPD. Os itens marcados ⚖️ exigem validação jurídica/DPO.

## Finalidade

Conferência interna de documentos financeiros da imobiliária por funcionários autorizados.

## Dados tratados

Conteúdo textual de documentos financeiros, que pode incluir dados pessoais de clientes, proprietários,
inquilinos, funcionários e fornecedores (nomes, CPF/CNPJ, valores, endereços). Nome do usuário para login.

## Fluxo e retenção

| Local | O que existe | Retenção |
|---|---|---|
| Navegador do usuário | PDF e texto extraído; depois só o resultado | Até limpar, cancelar ou fechar a página (melhor esforço) |
| Cloudflare Worker | Texto durante a requisição | Somente durante o processamento; não gravado |
| Cookie de sessão (navegador) | Nome do usuário, assinado | Até 8 h ou até sair |
| OpenAI | Texto enviado para análise | `store: false`; logs de monitoramento de abuso podem ser retidos (até ~30 dias, verificar termos vigentes) ⚖️ |
| Banco de dados próprio | Nenhum | — |

Logs técnicos contêm apenas categoria de erro e rota, sem conteúdo.

## Fornecedores

- **Cloudflare** — hospedagem. Processamento fora do Brasil. ⚖️
- **OpenAI** — análise do texto. Processamento fora do Brasil; avaliar Zero Data Retention. ⚖️

## Pontos para o jurídico / DPO ⚖️

- Base legal do tratamento (art. 7º / 11 da LGPD).
- Transferência internacional (art. 33) e contratos (DPA) com Cloudflare e OpenAI.
- Transparência aos titulares e canal de atendimento aos direitos (art. 18).
- Encarregado (DPO) e canal de contato: **a definir**.
- Necessidade de registro de auditoria (quem analisou o quê) versus a regra de não persistir.
