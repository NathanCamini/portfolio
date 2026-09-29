# Nathan Camini — Portfólio

Landing page bilíngue (PT/EN) de um desenvolvedor back-end, construída a partir do design **Nocturne**:
biografia, projetos (passados e futuros) e hobbies — laboratório de IA, um **Porsche 911 GT3 RS em Three.js** guiado
pelo scroll, um **mini-jogo de vôlei de praia** (campanha com chefe, modo endless e **online 1×1 em tempo real**) e
um **Peek Trainer** no estilo Rainbow Six Siege — os dois com um **ranking global compartilhado** (Cloudflare
Workers + D1).

```bash
npm install
npm run dev        # http://localhost:3000 → abre em /pt ou /en conforme o idioma do sistema
npm run check      # typecheck + lint + testes
npm run preview    # build estático + Worker e D1 locais (wrangler) em :8787 — o ranking funciona aqui
npm run deploy     # build estático + publicação no Cloudflare Workers
npm run db:migrate # aplica migrations/ no D1 de produção (só para mudanças futuras de schema)
```

Requer Node ≥ 20.9. O site é um **export estático** (`out/`): não há servidor Node em produção. A única parte
dinâmica é um Worker pequeno em `worker/` (API do currículo, ranking dos mini-jogos e salas do vôlei online). Com
`npm run dev` os jogos funcionam normalmente e o ranking e o online aparecem como indisponíveis (não há Worker); use
`npm run preview` para testá-los.

## Deploy na Cloudflare

O `wrangler.jsonc` publica `out/` como _static assets_ de um Worker:
`/pt` → `pt.html`, barra final redirecionada, URLs desconhecidas → `404.html` com status 404. O arquivo
`public/_headers` define cache de 1 ano para `/_next/static/*` (arquivos com hash) e headers de segurança básicos.
Só `/api/*` passa pelo código do Worker (`worker/index.ts`); todo o resto sai direto dos arquivos estáticos.

### Ranking dos mini-jogos: banco D1, sem passo manual

O binding `DB` tem só `database_name` (`portfolio-ranking`): o primeiro `wrangler deploy` cria o banco na sua conta
e os seguintes reaproveitam. O próprio Worker cria as tabelas que faltarem, a partir dos arquivos de `migrations/`
(todos idempotentes), na primeira requisição que precisar delas — é assim que `0003_ranking.sql` (as tabelas do
ranking compartilhado, já com o placar do endless copiado das tabelas antigas) entra num banco que já existia.
`npm run db:migrate` aplica as migrations pela CLI, se preferir. Deploys de _preview_ (branches) não recebem banco:
os jogos funcionam e o ranking aparece como indisponível, o que mantém testes fora do ranking real.

### Currículo: PDF e API

Os dois saem dos mesmos dicionários da página (`src/lib/resume.ts`), então nunca ficam desatualizados:

- **PDF** — `/cv/nathan-camini-pt.pdf` e `/cv/nathan-camini-en.pdf`, gerados no build com jsPDF
  (`src/app/cv/[file]/route.ts`). Texto real, selecionável e com links.
- **API** — `GET /api/nathan` devolve o currículo em JSON (`src/lib/resume-api.ts`):
  `?lang=pt|en` (senão usa `Accept-Language`), `?format=pdf` ou `Accept: application/pdf` → 303 para o PDF,
  CORS aberto, `HEAD`/`OPTIONS`, 405 para outros métodos. Funciona com `npm run preview` (não com `npm run dev`).

```bash
curl https://seu-dominio.com/api/nathan?lang=pt
```

### Terminal

O botão **Abrir terminal** do topo (ou as teclas `'` / `~` em qualquer lugar da página) abre um terminal no centro da
tela. Na primeira vez ele digita `help` sozinho e lista os comandos, todos clicáveis: `whoami`, `ls projetos`,
`cat experiencia.txt`, `curl /api/nathan` (chama a API de verdade), `open curriculo.pdf`, `sudo contratar nathan` 🎉,
`volei`, `rm -rf /` e outros. Comandos desconhecidos respondem que _o sistema não estava esperando tanta
criatividade_. A lógica dos comandos fica em `src/components/terminal/engine.ts` (pura, com testes).

**Pela linha de comando**

```bash
npx wrangler login
NEXT_PUBLIC_SITE_URL=https://seu-dominio.com npm run deploy
```

**Pelo painel (deploy a cada push)**: conecte o repositório a um Worker com build command `npm run build`, deploy
command `npx wrangler deploy` e a variável de build `NEXT_PUBLIC_SITE_URL`.

> `NEXT_PUBLIC_SITE_URL` é lida **no build** (URLs canônicas, Open Graph, `sitemap.xml`, `robots.txt`). Sem ela,
> essas URLs saem como `http://localhost:3000`.

### Analytics (Cloudflare Web Analytics)

Sem cookies e sem dados pessoais, então não precisa de banner de consentimento. Fica **desligado** até existir a
variável de build `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` (`src/components/CloudflareAnalytics.tsx`):

1. Painel da Cloudflare → **Web Analytics** → **Add a site** → informe o domínio do site → escolha o snippet JS
   manual e copie só o valor de `"token"`.
2. No Worker: **Settings → Build → Variables and secrets** → adicione `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` com esse
   valor (tem que ser variável de **build**, não de runtime).
3. Faça um novo deploy. O script `beacon.min.js` passa a aparecer no fim do `<body>` de `/pt`, `/en` e da página 404.

Não ative ao mesmo tempo a "instalação automática" do Web Analytics para o mesmo domínio, senão as visitas contam
em dobro.

### Vôlei online (1×1)

**Partida rápida** (uma fila que junta dois desconhecidos) ou salas por link: uma pessoa cria a sala, manda o link
(`/#volei-CÓDIGO`) e as duas jogam em tempo real até 7 pontos.
Cada sala é um **Durable Object** que roda a física a 120 Hz e é o juiz da partida (servidor autoritativo), e cada
navegador **prevê** o jogo para responder ao teclado na hora, corrigindo-se pelos 30 estados por segundo que o
servidor manda. Quem cai no meio da partida volta para a mesma cadeira (a partida pausa por até 15 s). A partida
rápida vale **ranking online (Elo)**, gravado pelo servidor no D1, e a fila junta gente de nível parecido. O deploy cria
os Durable Objects (salas e fila) sozinho, pelas migrations do `wrangler.jsonc`; previews não têm salas e mostram o online como
indisponível. Arquitetura, protocolo, netcode (com medições de 0 a 250 ms de latência), limites, custos e testes:
**[docs/volei-online.md](docs/volei-online.md)**.

### Idioma

- `/` escolhe o idioma pela **configuração do sistema** do visitante (`navigator.languages`, na ordem de
  preferência): `pt-*` → `/pt`, `en-*` → `/en`, qualquer outro → `/en` (`fallbackLocale` em `src/i18n/config.ts`).
  Um script inline no `<head>` redireciona antes de pintar a página; sem JavaScript, `/` mostra os botões
  **Português / English**.
- Links diretos para `/pt` ou `/en` sempre abrem no idioma do link.
- O seletor PT/EN da navbar continua livre a qualquer momento.

## Stack

| Pacote                                       | Papel                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `next` 16 (App Router)                       | Export estático de `/pt` e `/en`, metadata/SEO                               |
| `react` 19                                   | UI                                                                           |
| `motion` 13                                  | Reveals no scroll, stagger dos cards, parallax, barra de progresso, expansão |
| `three` + `@react-three/fiber` 9             | Cena WebGL do carro (carregada sob demanda, fora do bundle inicial)          |
| `canvas-confetti`                            | Confete nas comemorações (carregado só quando dispara)                       |
| `jspdf`                                      | PDF do currículo, gerado no build (não vai para o navegador)                 |
| Cloudflare Workers + D1                      | API do ranking global (SQLite gerenciado), rate limiting por IP              |
| Cloudflare Durable Objects                   | Salas do vôlei online: WebSocket com hibernação, física autoritativa         |
| `wrangler`                                   | Preview local (Worker + D1 simulados) e deploy no Cloudflare Workers         |
| `vitest`, `eslint`, `prettier`, `typescript` | Qualidade                                                                    |

Sem Tailwind e sem biblioteca de i18n: os tokens do design system vivem em `globals.css` (CSS Modules por seção)
e as traduções são objetos TypeScript tipados.

## Estrutura

```
src/
├─ app/
│  ├─ (root)/                # "/" → /pt ou /en pelo idioma do sistema (sem JS: botões PT/EN)
│  ├─ [lang]/layout.tsx      # <html lang>, fonte Inter, metadata + hreflang, SSG de pt/en
│  ├─ [lang]/page.tsx        # composição das seções
│  ├─ global-not-found.tsx   # 404 bilíngue (out/404.html)
│  ├─ globals.css            # tokens Nocturne + classes .btn/.card/.tag/.seg
│  ├─ fonts.ts, sitemap.ts, robots.ts
├─ config/site.ts            # nome, e-mail, redes, cor/acabamento do carro
├─ config/game.ts            # pontos por fase e limite da CPU no endless (lido também pelo Worker)
├─ i18n/                     # config, detect (idioma do sistema), dicionários pt/en, I18nProvider
├─ lib/                      # palette.ts (tokens → canvas/WebGL), scroll.ts
│  ├─ ranking/               # ranking compartilhado (navegador + Worker): jogos, regras por jogo, nomes, contrato
│  └─ volley-online/         # vôlei online (navegador + Worker): protocolo, partida, sala, previsão — testado
├─ hooks/                    # useTypewriter, useMediaQuery
└─ components/
   ├─ motion/                # Reveal (whileInView), LocaleTransition, easing
   ├─ fun/                   # RotatingText, Marquee (velocidade do scroll), Magnetic, Tilt, Cursor
   ├─ layout/Navbar          # nav fixa + seletor PT/EN + barra de progresso
   ├─ sections/              # Hero, Bio, Projects, Hobbies (IA), CarShowcase, VolleyballSection, Contact
   ├─ three/
   │  ├─ CarCanvas.tsx       # <Canvas> R3F: luzes, env map local, estrada, render sob demanda
   │  ├─ CarRig.tsx          # ponte React ↔ controller (useFrame)
   │  ├─ CarRigController.ts # lógica scroll × rotação (TS puro, testado)
   │  ├─ useDragRotation.ts  # ponteiro/teclado → intenção de rotação
   │  └─ porsche911/         # modelo procedural: body (loft), wheel, details, materials
   ├─ incident/              # easter egg do sticker DELETE: roteiro psql (TS puro, testado) + glitch
   ├─ ranking/               # UI do ranking, igual para todo jogo: useRanking(jogo), cartão com abas por jogo
   ├─ siege/                 # Peek Trainer: engine (TS puro, testado), render, componente
   └─ volleyball/
      ├─ engine/             # física, IA, render — TS puro, sem React (testado)
      ├─ useVolleyballGame.ts# loop de passo fixo, input, resize, apito inicial/final
      ├─ online/             # aba online: conexão, reconexão, previsão, lobby e resultado
      └─ VolleyballGame.tsx  # painel: toolbar com as abas, tela cheia, controles touch
worker/
├─ index.ts                  # /api/ranking/:jogo (rotas, validação, rate limit), /api/volley → volley.ts; o resto → resume-api.ts
├─ store.ts                  # SQL do D1 (ranking por jogador, ticket de uso único)
├─ volley*.ts                # /api/volley: o Durable Object de cada sala e o da fila da partida rápida
└─ test/                     # testes da API contra SQLite real (node:sqlite) + e2e do online contra wrangler dev
migrations/                  # schema do D1
docs/volei-online.md         # o vôlei online em detalhe
```

## Decisões de engenharia

**Carro: scroll × mouse sem conflito.** Dois grupos aninhados, cada um com um único "escritor":
`track` (só o scroll escreve `position.x`) contém `spin` (só o ponteiro escreve `rotation`). Como as
transformações compõem pai → filho, girar nunca tira o carro da trajetória e rolar nunca reseta a rotação.
Rodas, suspensão (squat/dive) e o aerofólio ativo são **derivados** do deslocamento real de `track`. Os testes em
`CarRigController.test.ts` provam essa independência.

**Porsche 911 procedural.** Sem arquivo `.glb`: a carroceria é um _loft_ de ~160 seções transversais geradas a
partir de linhas de caráter (teto fastback, cintura, para-lamas, largura em planta com quadris traseiros largos),
com proporções reais do 992 (4,52 m × 1,85 m, entre-eixos 2,45 m, rodas 20"/21"). Faróis redondos com DRL de 4
pontos, lanterna em barra, pinças vermelhas fixas enquanto o disco gira. **Sem sombras**: nenhum shadow map,
nenhum plano "shadow catcher". Para trocar por um modelo GLB, basta retornar o mesmo formato `Porsche911`.

**Performance.** Three.js fica num chunk separado (~250 KB gz) carregado uma viewport antes da seção;
`frameloop="demand"` faz o carro parado custar zero quadros; o loop pausa fora da tela. Scroll e arraste não
causam nenhum re-render do React (Motion values e refs lidos no `useFrame`).

**Mini-jogo.** Motor puro em TypeScript com **passo fixo de 120 Hz** (física idêntica em telas de 60/120/144 Hz,
sem a bola atravessar a rede), IA que prevê o ponto de queda, quadra lógica 960×540 com letterbox. O teclado só é
capturado com o painel visível. Tela cheia pela Fullscreen API; controles touch em telas `pointer: coarse`.

**Modos.** A **campanha** tem duas fases de 7 pontos: a fase 1, na praia, contra uma CPU mais lenta que erra a
leitura de parte das bolas; e a fase 2, o chefe: um **bug em produção** — uma joaninha maior e rápida, que pula cedo
e corta toda bola, mas que "buga" (lê errado uma bola em sete e glitcha na tela, em ciano e magenta) — numa arena
em alerta vermelho (luz de alarme, pixels corrompidos subindo, vinheta pulsando, tela tremendo a cada ponto dele).
Só chega ao chefe quem vence a fase 1; quem perde repete a fase em que está, e o progresso fica salvo no navegador.
O **endless** é à parte: a CPU original, sem limite de pontos para o jogador, e acaba quando a CPU chega a 7 — é o
único modo que vale ranking.

**Dificuldade medida, não chutada.** `engine/bot.ts` tem um jogador simulado com limites humanos: relê a bola a cada
250 ms (tempo de reação médio) e erra mais a previsão quanto mais longe a bola está. Ele enfrenta cada perfil em 500
partidas com sementes fixas: vence **~98%** da fase 1, **~60%** contra o bug e **~50%** contra a CPU original do
endless (que ficou idêntica: dá o mesmo resultado, ponto a ponto, que o motor antigo nas mesmas sementes). Os testes
travam essas faixas (`engine/physics.test.ts`).

**Ranking global, compartilhado.** Um sistema só para todos os mini-jogos: mesma API, mesmo banco, mesmo filtro de
nomes e o mesmo cartão de ranking — cada jogo entra com uma linha em `src/lib/ranking/contract.ts` e as suas regras em
`rules.ts`. Cada jogo tem o seu top 10 (as pontuações não são comparáveis), mas o cartão tem **abas por jogo** e abre
de qualquer um deles; o nome salvo vale para todos. Três endpoints por jogo: `GET /api/ranking/:jogo`,
`POST /api/ranking/:jogo/matches` e `POST /api/ranking/:jogo/scores`. O top 10 mostra a **melhor marca de cada
jogador** (nome sem diferenciar maiúsculas/acentos), com empate decidido por quem chegou primeiro — uma única query
com `ROW_NUMBER()`.

- **Vôlei (endless):** vale quantos pontos você faz antes de a CPU chegar a 7.
- **Peek Trainer:** vale a pontuação da rodada de 30 s; o placar mostra o rank (Copper → Champion) e o % de
  headshots.

Validação contra trapaça, em camadas:

- **Regras de cada jogo, derivadas do próprio motor** (`src/lib/ranking/rules.ts`, as mesmas constantes que o jogo
  usa). Vôlei: tempo mínimo por ponto (a bola paira 900 ms no saque e há 1,2 s de pausa após cada ponto), contando os
  seus pontos e os 7 da CPU — 100 pontos em 1 minuto é recusado. Peek Trainer: acertos ≤ tiros, headshots ≤ acertos,
  no máximo 74 alvos por rodada (o ritmo de aparição do motor) e uma pontuação que esses acertos consigam fazer
  (sequência perfeita com os headshots no multiplicador mais alto) — os testes simulam uma rodada perfeita e garantem
  que ela nunca é recusada.
- **Relógio do servidor:** no início o jogo pede um _ticket_ (UUID aleatório, válido só para aquele jogo). Na hora de
  salvar, o relógio da partida não pode passar do tempo que o servidor viu desde o ticket (+5 s de folga de rede), e
  uma rodada do trainer não pode chegar antes dos 30 s.
- **Um ticket, uma pontuação:** o insert e o consumo do ticket acontecem na mesma transação (batch do D1), com
  `UNIQUE(match_id)` de reserva — reenviar a requisição não duplica a pontuação. Tickets expiram em 3 h.
- **Rate limiting** por IP (binding nativo da Cloudflare): 6 partidas e 10 envios por minuto.
- **Nome:** 3–16 caracteres, só letras latinas, números, espaço, `_` e `-`; nomes reservados (admin, CPU…) e
  palavrões/ofensas em PT e EN recusados mesmo disfarçados (maiúsculas, acentos, leetspeak `p0rr4`, separadores
  `f-u-c-k`, letras esticadas, letras full-width). O filtro roda no navegador (feedback imediato, sem requisição) e de
  novo no Worker; um nome recusado **não deixa salvar** e mostra o erro, sem gastar o ticket.

Isso barra adulteração casual (editar a requisição no DevTools, repetir o POST, inventar placar). Não é prova de
partida real: quem se dedicar ainda consegue forjar um resultado _plausível_. O próximo passo seria o servidor
re-simular a partida a partir dos inputs gravados — o motor é TypeScript puro e determinístico, então pode rodar no Worker.

**Easter egg: `DELETE` sem `WHERE`.** O sticker `DELETE * from USERS; WHERE …` do hero executa a query: cada bloco
da página (navbar + filhos de `<main>`) some com glitch e a tela "desliga" como um CRT; no centro, uma sessão `psql`
repete a query com seus erros (`ERROR: syntax error at or near "WHERE"`, transação abortada) e digita `ROLLBACK;` —
cada linha do log traz um bloco de volta. Nada é desmontado: os blocos só ficam ocultos via Web Animations API
(`cancel()` devolve o DOM intacto), então scroll, carro e partida continuam onde estavam. A sessão inteira é uma
timeline pura (`frameAt(timeline, t)`), coberta por testes; `Esc` pula, e `prefers-reduced-motion` troca o glitch
por um fade.

**i18n.** `/pt` e `/en` são pré-renderizados (SEO + hreflang; `x-default` aponta para `/`, que detecta o idioma
do sistema). A troca de idioma é estado no cliente + `history.replaceState`: o texto muda na hora e **nada remonta**
— a partida e a posição do carro continuam.

**Acessibilidade.** `prefers-reduced-motion` respeitado globalmente (`MotionConfig`), carro controlável por
teclado (setas / Home), texto do terminal de IA exposto por inteiro a leitores de tela, foco gerenciado no jogo.

## Personalização

- Textos: `src/i18n/dictionaries/pt.ts` e `en.ts` (os `[colchetes]` são placeholders do design).
- Contato, cor/acabamento do carro: `src/config/site.ts`. Pontos por fase e limite da CPU no endless:
  `src/config/game.ts` (mudar o limite muda o significado do ranking: comece um novo). Perfis de dificuldade da
  CPU (fase 1, endless, chefe): `CPU` em `src/components/volleyball/engine/constants.ts`.
- Lista de palavras bloqueadas nos nomes: `src/lib/ranking/nickname.ts`. Novo jogo no ranking: uma entrada em
  `GAMES` (`src/lib/ranking/contract.ts`), as regras em `rules.ts` e a apresentação em `src/components/ranking/games.ts`.
- Cores: tokens em `src/app/globals.css` — o canvas do jogo e a cena 3D leem os mesmos tokens.
