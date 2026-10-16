# Revisão iOS — 15/10/2026

## Limite de evidência

Esta revisão é de código e contratos de layout. Não há Simulator/Xcode completo nem iPhone conectado neste ambiente. O relato de tela cortada no iPhone 13 **ainda não foi reproduzido visualmente**; faltam capturas antes/depois e identificação de build/update/runtime instalado. Não atribuir a causa do relato exclusivamente à área segura e não declarar aceite nativo.

## Ajustes preparados

| Superfície | Risco observado no código anterior | Ajuste |
|---|---|---|
| Hoje, Diário e Perfil | Topo fixo de 56, independente do notch/status bar | SafeAreaView com top/left/right e espaçamento local. O inset inferior continua responsabilidade da tab bar |
| Hoje | Calorias de cinco dígitos e fonte ampliada competiam com anel na mesma linha | Resumo passa para coluna conforme largura/escala ou cinco dígitos; mantém tamanho de texto e conteúdo |
| Macronutrientes | Flex basis fixo mesmo com fonte ampliada | Uma coluna quando a largura efetiva exige, mantendo 2×2 no telefone padrão |
| Anel calórico | Rótulo escalável dentro de um círculo fixo | Fonte ampliada posiciona percentual/legenda fora do círculo, sem truncar nem desativar escala |
| Diário | Seleção de data limitada a 58 pt de altura | Altura intrínseca dos chips, sem crescimento para ocupar o restante da tela |
| Perfil | Nome limitado a duas linhas e email a uma | Texto pode crescer/rolar com a tela |

`Text.autoLineHeight`, navegação, seis itens da tab bar, escala de fonte e ações existentes foram preservados. Nenhuma dependência, configuração nativa ou identidade visual foi alterada.

## Evidência automatizada local

- Regressões de contrato foram executadas antes do ajuste: 4 falhas (ausência de área segura nos três screens e ausência de reflow em fonte ampliada).
- Depois: 4 suítes / 35 testes passaram (DashboardScreen, FoodLogScreen, ProfileScreen e CalorieRing).
- TypeScript (`npx tsc --noEmit` no app): passou.
- ESLint dos dez arquivos alterados: zero erros; quatro avisos `no-void` de chamadas já existentes.

Esses testes verificam estrutura/props e regressão funcional; Jest não calcula o layout nativo nem comprova ausência de cortes no aparelho.

## Roteiro de aceite no aparelho

Registrar iOS, versão/build, runtime/update ID, orientação, tamanho de texto, Texto em Negrito e Zoom da Tela. Confirmar se “tela inicial” significa Welcome, onboarding ou Hoje autenticado.

| Jornada | Verificação | Estado |
|---|---|---|
| Welcome, login, cadastro, recuperação | Último CTA rolável, teclado, mensagens de erro, scanner sem conta | Captura nativa pendente |
| Onboarding | Nome longo, opções, voltar, teclado, confirmação | Captura nativa pendente |
| Hoje | Nome de 40 caracteres; 1/4/5 dígitos; acima de 100%; Fibras; loading/vazio/erro | Captura nativa pendente |
| Scanner | Permissão, câmera/galeria, erro/sem comida, edição e salvar | Captura nativa pendente |
| Diário/plano | Chips com fonte grande, totais, grupos, modal editando valores | Captura nativa pendente |
| Coach/voz | Teclado, resposta longa, troca de aba, bloqueio, Central de Controle, chamada, silencioso | Captura nativa pendente |
| Perfil/evolução/social | Nome/email longos, rolagem, vazio/erro, logout, exclusão | Captura nativa pendente |
| Créditos/admin/convite | Saldo zero/reserva, erros, emissão/revogação, resgate autenticado | Após integração |

Rodar no iPhone 13 real com escala padrão e maior escala acessível; iPad tela cheia e Split View; regressão Android/web. Conferir alvo de toque de 44 pt, VoiceOver e foco em interação real. Validação web não substitui essa etapa.
