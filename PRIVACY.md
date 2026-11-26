# Privacidade e tratamento de dados

> Rascunho técnico. **Não** declara conformidade com a LGPD. Os itens marcados ⚖️ exigem validação jurídica/DPO.

## Finalidade

Conferência interna de documentos financeiros da imobiliária por funcionários autorizados.

## Dados tratados

Conteúdo textual de documentos financeiros, que pode incluir dados pessoais de clientes, proprietários,
inquilinos, funcionários e fornecedores (nomes, CPF/CNPJ, valores, endereços e dados bancários dos proprietários:
banco, agência e conta). E-mail da usuária para login (conta no Supabase Auth).

## Fluxo e retenção

| Local | O que existe | Retenção |
|---|---|---|
| Navegador do usuário | PDFs, texto, registros lidos, resultado, relatório e lançamentos manuais digitados (só em memória) | Até nova conferência, sair, recarregar ou fechar a página (melhor esforço) |
| Computador do usuário | PDF baixado pelo "Juntar PDF" e relatório impresso/salvo em PDF (contém CPF/CNPJ e dados bancários) | Fora do controle do app: cabe ao usuário guardar e descartar ⚖️ |
| Cloudflare Worker | Nenhum dado dos documentos (a conferência roda no navegador) | — |
| Cookie de sessão (navegador) | Nome do usuário, assinado | Até 8 h ou até sair |
| OpenAI | Nenhum (rota `/api/analisar` existe, mas o app não a usa) | — |
| Supabase (tabela `represados`) | Só os **represados**: dados lidos dos recibos e extratos (nomes, CPF/CNPJ, valores, endereço, dados bancários) e o nome de quem guardou, mais a lista de nomes dos proprietários represados. O PDF não. | Até a pessoa concluir a conferência daquele proprietário (apaga na hora) ⚖️ |
| Supabase (tabela `represados_log`) | Log de cada documento guardado ou apagado dos represados: quando, tipo, nº do contrato, nº do extrato, quem guardou e quem apagou. Sem nome, CPF ou valor. | 30 dias (cada gravação apaga o que for mais antigo) |

Logs técnicos contêm apenas categoria de erro e rota, sem conteúdo.

## Fornecedores

- **Supabase**: guarda os represados (projeto Supabase separado, só para isso). Acesso só pelo Worker, com chave secreta; RLS ligado sem políticas. ⚖️ contrato/DPA com o Supabase.

- **Cloudflare** — hospedagem. Processamento fora do Brasil. ⚖️
- **OpenAI** — nenhum dado é enviado hoje (a rota existe, mas o app não a usa). Se voltar a ser usada:
  processamento fora do Brasil; avaliar Zero Data Retention. ⚖️

## Pontos para o jurídico / DPO ⚖️

- Base legal do tratamento (art. 7º / 11 da LGPD).
- Transferência internacional (art. 33) e contratos (DPA) com Cloudflare e OpenAI.
- Transparência aos titulares e canal de atendimento aos direitos (art. 18).
- Encarregado (DPO) e canal de contato: **a definir**.
- Registro de auditoria: só o log dos represados (`represados_log`, 30 dias). Avaliar se é preciso registrar quem conferiu o resto.
- Guarda e descarte dos relatórios impressos ou salvos em PDF, que trazem CPF/CNPJ e dados bancários.
