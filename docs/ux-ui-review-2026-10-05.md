# CalorIA — revisão de UI e UX

## Escopo e referências

Melhorias na identidade existente (laranja, azul e fundo claro), nos componentes compartilhados e nas telas principais. React Native, React Navigation, Zustand e Webpack foram preservados. Não houve alteração de API, banco ou regras de nutrição.

UI-UX Pro Max: buscas `nutrition wellness mobile dashboard --design-system` e `accessible touch navigation --stack react-native`. Aplicados: hierarquia de dados, superfícies simples, alvos de toque, contraste e navegação tipada. O resultado de landing page com depoimentos não se aplica ao app e foi descartado. A sugestão de paleta verde não substituiu a marca existente.

Referências consultadas: [Cal AI](https://www.calai.app/) (prioridade de fotografar e acompanhar refeições), [acessibilidade do React Native](https://reactnative.dev/docs/accessibility) e [Inter oficial via Google Fonts](https://github.com/google/fonts/tree/main/ofl/inter). Recursos da Inter preservam a licença em `app/assets/fonts/OFL.txt`.

Impeccable: contexto, princípios de acabamento, hierarquia, responsividade e auditoria técnica. Uma execução do detector produziu um aviso de fundo creme. É uma característica preexistente da marca, mantida intencionalmente; não é evidência de falha funcional.

## Mudanças

- Cores genéricas alinhadas à marca; cores específicas legíveis para textos de proteína e gordura.
- Inter real: os cinco arquivos TTF anteriores eram HTML. Substituídos por instâncias estáticas da Inter oficial; WOFF2 local para a web, sem dependência de serviço de fontes externo.
- Entrada explica scanner, acompanhamento e coach; ações de cadastro e login preservadas.
- Dashboard destaca calorias, macros e ações para scanner/diário. Metas continuam dependentes de dados reais do plano.
- Macros sem meta não exibem percentuais fictícios. Cartões se adaptam a larguras pequenas.
- Coach e formulário de refeições limitam a largura em desktop. Campos de refeições possuem rótulos permanentes; fechamento e seleção têm alvos de toque adequados.
- Input compartilhado anuncia nome e erro, mantém foco visual e repassa os eventos de validação do consumidor.
- Navegação com rótulos mais curtos e inset inferior seguro. Perfil com controles sem emojis e papel de botão.
- Webpack define `__DEV__`; implementação web de armazenamento impede import do AsyncStorage nativo no navegador.

## Validação

| Verificação | Resultado |
| --- | --- |
| TypeScript | `npm --prefix app run type-check` passou |
| Jest | 74 suítes, 415 testes passaram na integração com origin/main |
| Lint dos arquivos de implementação alterados | 0 erros; 10 avisos (principalmente `no-void` e callback da câmera na navegação) |
| Lint geral | Falha por problemas preexistentes fora deste escopo; não foi apresentado como aprovado |
| Build de produção | `NODE_ENV=production npm --prefix app run build:web` compila; aviso de bundle de aproximadamente 851 KiB na integração |
| Inicialização do build de produção | Bloqueada por `API_BASE_URL` ausente; o fail-fast de release foi preservado |
| Navegador em desenvolvimento | Sem exceções de JavaScript na sessão final; avisos de compatibilidade do React Native Web permanecem |
| Fontes | Cinco famílias carregadas; versões WOFF2 emitidas pelo build |
| Layout | Capturas em 375/390 px e 1440 px; sem overflow horizontal nos estados medidos |
| Interação | Welcome → login; erros de e-mail/senha após blur; Dashboard → scanner; tabs Hoje/Diário/Coach/Perfil; modal de refeições abre, habilita salvar com dados válidos e fecha |

Capturas locais em `.impeccable/review/`. As telas internas foram abertas pelo preview **exclusivo de desenvolvimento**, sem conta real. Erros de dados no dashboard/diário refletem ausência de sessão/API funcional no preview. Não foram feitos login real, salvamento de refeições, upload de imagens, geração de dieta, chamadas de IA ou ações destrutivas. iOS/Android, leitor de tela real, teclado físico mobile, fonte ampliada e modo escuro não foram certificados.

## Reproduzir

```bash
cd app
npm run web -- --host 127.0.0.1
npm run type-check
npm test -- --runInBand
NODE_ENV=production npm run build:web
```

Entrada: http://127.0.0.1:3000/ . Telas internas em desenvolvimento: http://127.0.0.1:3000/?preview=app . Esse preview não cria autenticação ou dados e não deve ser tratado como teste de integração.

## Pendências

1. Configurar a URL real da API para release e repetir a verificação autenticada.
2. Validar o app em simuladores/dispositivos após atualização dos assets nativos de fontes.
3. Tratar o backlog de lint global e avaliar divisão do bundle web separadamente.
