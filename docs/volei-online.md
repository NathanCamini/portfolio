# Vôlei online 1×1: fase 1

A primeira fase do vôlei online: **salas por link, uma pessoa contra outra, em tempo real**. Um servidor autoritativo
(um Durable Object da Cloudflare por sala) roda a física, e cada navegador **prevê** a partida para responder ao
teclado na hora. Este documento explica o que foi feito, por quê, e como testar, rodar e publicar.

- [Como se joga](#como-se-joga)
- [Arquitetura](#arquitetura)
- [Onde está cada coisa](#onde-está-cada-coisa)
- [API HTTP](#api-http)
- [Protocolo WebSocket](#protocolo-websocket)
- [Ciclo de vida da sala](#ciclo-de-vida-da-sala)
- [Servidor autoritativo](#servidor-autoritativo)
- [Netcode no navegador](#netcode-no-navegador)
- [Reconexão](#reconexão)
- [Segurança e limites](#segurança-e-limites)
- [Custo no plano gratuito](#custo-no-plano-gratuito)
- [Testes](#testes)
- [Rodar localmente](#rodar-localmente)
- [Deploy](#deploy)
- [Limitações conhecidas](#limitações-conhecidas)
- [Próximas fases](#próximas-fases)

## Como se joga

1. No painel do vôlei, aba **Online · 1×1**: digite um apelido e clique em **Criar sala**.
2. A sala mostra um código de 5 letras (`K7MPQ`) e o link `https://site/#volei-K7MPQ`, com um botão de copiar.
   O link aponta para a raiz do site: quem recebe cai no próprio idioma (`/` redireciona e mantém o `#`).
3. Quem abre o link vai direto para a aba online com o código preenchido. Se o navegador já conhece o apelido (do
   ranking ou de outra sala), entra sozinho; senão, digita o apelido e aperta Enter.
4. Os dois clicam em **Estou pronto**, vem uma contagem de 3 segundos e a partida começa. Ganha quem fizer 7 pontos.
   Quem entra no lado direito vê a quadra espelhada: **você está sempre à esquerda**.
5. No fim: resultado, **placar da sala** (vitórias somadas) e **Jogar de novo**. Na revanche, quem perdeu saca.

Controles: os mesmos do jogo local (setas ou A/D e W/espaço; botões na tela em celulares).

## Arquitetura

```
 Navegador A                                   Cloudflare                                  Navegador B
┌────────────────────┐                ┌──────────────────────────────┐                ┌────────────────────┐
│ OnlineVolley (UI)  │  POST /rooms   │ Worker (worker/index.ts)     │                │ OnlineVolley (UI)  │
│ useOnlineVolley    │ ─────────────▶ │  └ volley.ts: cria sala,     │ ◀───────────── │ useOnlineVolley    │
│  ├ Predictor       │                │    valida Origin e limite,   │  GET /rooms/X  │  ├ Predictor       │
│  ├ TickClock       │   WebSocket    │    encaminha o upgrade       │   WebSocket    │  ├ TickClock       │
│  └ render (canvas) │ ◀════════════▶ ├──────────────────────────────┤ ◀════════════▶ │  └ render (canvas) │
└────────────────────┘  teclas ▶      │ Durable Object "sala X"      │      ◀ teclas  └────────────────────┘
                        ◀ estado      │ (worker/volley-room.ts)      │      estado ▶
                        30×/s         │  └ RoomCore (room.ts)        │      30×/s
                                      │     └ OnlineMatch (match.ts) │
                                      │        └ stepGame, 120 Hz    │
                                      └──────────────────────────────┘
```

- **Uma sala = um Durable Object**, endereçado pelo código (`idFromName(código)`). Todas as mensagens de uma sala
  passam por um único objeto, numa única thread: não há corrida entre os dois jogadores e não há banco no meio.
- **O servidor é o juiz.** Os navegadores mandam só **quais teclas estão apertadas** e a partir de qual instante
  (_tick_). A física, os pontos e o fim da partida acontecem no servidor. Mexer no navegador não muda o placar.
- **O mesmo motor dos dois lados.** A física (`engine/physics.ts`) é TypeScript puro e roda igual no Worker e no
  navegador. É isso que deixa o navegador prever a partida sem esperar o servidor.
- **Regras da sala sem Cloudflare.** `RoomCore` é uma máquina de estados pura: relógio, timers, sockets, sorteio e
  armazenamento chegam por interface (`RoomHost`, `Conn`). Nos testes, um relógio falso roda partidas inteiras em
  milissegundos. O `VolleyRoom` só liga essas interfaces ao runtime de Workers.

## Onde está cada coisa

```
src/lib/volley-online/            # compartilhado: roda no Worker e no navegador (imports relativos)
├─ protocol.ts                    # versão, constantes de rede (NET), códigos de sala, teclas, snapshots, mensagens
├─ match.ts                       # OnlineMatch: a partida autoritativa (120 Hz) + InputTimeline das teclas
├─ room.ts                        # RoomCore: lobby, prontos, contagem, pausa, W.O., revanche, persistência
├─ predictor.ts                   # Predictor (previsão + reconciliação + suavização), TickClock, mirrorState
└─ testing.ts                     # bots e gerador pseudoaleatório para os testes
worker/
├─ volley.ts                      # rotas HTTP /api/volley/rooms
├─ volley-room.ts                 # o Durable Object VolleyRoom (adaptador de RoomCore)
└─ test/volley.test.ts            # rotas; test/online.e2e.test.ts: partida real contra `wrangler dev`
src/components/volleyball/
├─ VolleyballGame.tsx             # painel: abas Campanha / Endless / Online (cada aba monta só o seu jogo)
├─ TouchPad.tsx                   # botões na tela, usados pelo jogo local e pelo online
└─ online/
   ├─ useOnlineVolley.ts          # conexão, reconexão, loop de previsão e desenho
   ├─ OnlineVolley.tsx (+ .css)   # telas: início, lobby, contagem, pausa, reconectando, resultado
   └─ link.ts                     # link da sala (#volei-CÓDIGO)
```

O motor ganhou o mínimo para dois humanos:

- `stepGame(g, dt, input, rng, opponent?)`: com `opponent`, o corpo da direita é guiado por esse input em vez da IA.
- `kickoff(g, lado)`: começa a partida com saque de um lado.
- O estágio `online` (primeiro a 7).

O modo contra a CPU continua idêntico, e os testes de dificuldade do motor seguem passando.

## API HTTP

| Rota                          | Resposta                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /api/volley/rooms`      | `201 { "code": "K7MPQ" }`: sala nova. `403` de outro site, `429` acima do limite, `503` sem DO.    |
| `GET /api/volley/rooms/:code` | Com `Upgrade: websocket`: `101`, o WebSocket da sala. `Origin` precisa ser o próprio site (`403`). |
| `GET /api/volley/rooms/:code` | Sem upgrade: `200 { code, phase, players }` ou `404`. A página checa isso antes de abrir o socket. |

O pré-teste por HTTP existe porque um WebSocket recusado não diz o motivo ao navegador. Com ele, a página mostra
"sala não encontrada", "sala cheia" ou "online indisponível".

**Códigos de sala:** 5 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sem I, L, O, 0 e 1, que se confundem ao ditar
ou digitar no celular). São 28,6 milhões de combinações sorteadas com o gerador criptográfico da plataforma. Uma
colisão com sala existente é rara, e o Worker tenta outra (até 5 vezes).

## Protocolo WebSocket

Mensagens JSON, uma por frame. Toda mensagem do cliente passa por `parseClientMessage`, que é estrita: confere tipos,
faixas e tamanho, e remonta a mensagem só com os campos conhecidos. Qualquer coisa fora disso derruba a conexão com
`bad_message`. **Versão do protocolo: 1**. Um
cliente antigo recebe `bad_version`, e a página pede para recarregar.

**Cliente → servidor**

| Mensagem                    | Quando                                                                      |
| --------------------------- | --------------------------------------------------------------------------- |
| `hello { v, name, token? }` | Primeira mensagem (até 5 s). `token` recupera a cadeira depois de cair.     |
| `ready { ready }`           | Pronto / cancelar, no lobby e depois de uma partida (revanche).             |
| `input { tick, bits }`      | Mudança de teclas, valendo a partir de `tick`. `bits`: 1 ← · 2 → · 4 pulo   |
| `ping { c, rtt? }`          | A cada 2 s. `c` volta no `pong`, e `rtt` é o ping medido, mostrado a todos. |
| `leave`                     | Sair da sala. No meio da partida, conta como W.O.                           |

**Servidor → cliente**

| Mensagem                        | Quando                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `welcome { side, token, room }` | Cadeira confirmada (0 = esquerda, 1 = direita) e o token para voltar a ela.                                                                               |
| `room { room }`                 | O lobby mudou: fase, cadeiras (nome, conectado, pronto, ping), tempo restante, placar da sala, último resultado.                                          |
| `state { s }`                   | Snapshot autoritativo da partida (30 por segundo).                                                                                                        |
| `pong { c }`                    | Resposta ao ping.                                                                                                                                         |
| `error { code }`                | `bad_message`, `bad_version`, `invalid_name`, `room_full`, `room_not_found`, `rate_limited`, `replaced`, `timeout`. O servidor fecha o socket em seguida. |

**Snapshot:** `tick`, posição e velocidade dos três corpos (arredondadas a 1/1000 px), placar, fase do rali, tempo
da fase, relógio da partida, quem saca, quem fez o último ponto e **as teclas que cada jogador segura** (o
navegador usa as do adversário para prevê-lo). Tem cerca de 200 bytes.

## Ciclo de vida da sala

```
 waiting ──os dois prontos──▶ countdown ──3 s──▶ playing ──7 pontos──▶ over
    ▲                             │                │  ▲                  │
    └──── cancelou / caiu ────────┘          caiu ─▼  │ voltou + 3 s     │
                                                 paused ──15 s──▶ over (W.O.)
 over ──os dois prontos──▶ countdown (revanche: quem perdeu saca)
```

- **Cadeiras:** duas. Um terceiro recebe `room_full`. Nomes seguem as regras do ranking (3–16 caracteres, filtro de
  palavrões, reservados como "bot" e "cpu"), checadas no navegador e de novo no servidor.
- **Primeiro saque:** sorteio. Revanche: quem perdeu saca.
- **Saiu no meio da partida** (botão, fechou o painel ou trocou de aba): vitória do outro por W.O.
- **Caiu no meio da partida:** a partida **pausa** e a cadeira fica guardada por 15 s. Ver [Reconexão](#reconexão).
- **Caiu no lobby:** a cadeira também fica guardada por 15 s (um F5 não perde o lugar); depois é liberada.
- **Sala vazia:** um alarme apaga a sala 2 h depois de criada se ninguém estiver conectado; senão, confere de novo
  depois de mais 2 h.

O que é **persistido** no armazenamento do objeto: código, cadeiras (nome, token, pronto), placar da sala e último
resultado. A partida em si fica só na memória (é refeita 120 vezes por segundo, gravar não faria sentido).

## Servidor autoritativo

- **Passo fixo de 120 Hz, igual ao jogo local.** Um `setInterval` de ~60 Hz acorda o objeto, e ele roda quantos
  passos de 1/120 s couberem no tempo real passado (no máximo 250 ms por vez, sem rajada depois de um engasgo).
- **Teclas com hora marcada.** Cada `input` diz em qual _tick_ passa a valer. O servidor guarda uma linha do tempo
  por jogador (`InputTimeline`) e aplica a tecla exatamente naquele passo, o mesmo em que o navegador já a aplicou
  na previsão.
  - Uma tecla atrasada vale no próximo passo possível.
  - Uma marcada mais de 1 s no futuro é recusada.
- **Determinismo.** No modo online o motor não usa nenhum número aleatório: o mesmo início com as mesmas teclas dá
  sempre a mesma partida. Os testes provam isso rodando a mesma partida duas vezes.
- **30 snapshots por segundo** (um a cada 4 passos). Os outros 3 passos o navegador prevê sozinho.
- **Quantização.** O snapshot arredonda posições e velocidades a 1/1000 px. Para o navegador e o servidor
  continuarem idênticos, o servidor **adota o próprio estado arredondado** a cada snapshot enviado (e também ao
  pausar). Sem isso, um pulo previsto pelo navegador divergia do servidor por arredondamento, e o seu próprio
  jogador "tremia" nas correções. Com isso, até 80 ms de latência a correção do próprio corpo é **exatamente zero**.

## Netcode no navegador

O que o jogador vê é uma **previsão**: o navegador roda a mesma física localmente, alguns _ticks_ à frente do
servidor, e corrige quando chega a verdade.

**Predição (`Predictor`).** A cada quadro:

- lê as teclas;
- avança a simulação até o _tick_ alvo;
- aplica as próprias teclas na hora;
- para o adversário, repete as últimas teclas que o servidor disse que ele segurava;
- quando as teclas mudam, manda `input { tick, bits }` com o _tick_ em que a mudança foi aplicada.

**Reconciliação.** Quando chega um snapshot (que já é "passado", com meia ida e volta de atraso):

1. volta o jogo para o estado do servidor;
2. troca as teclas do adversário pelas reais;
3. **reaplica as próprias teclas** gravadas desde aquele _tick_ até o presente.

O resultado é a previsão corrigida pelo que o servidor sabe. Se a previsão estiver muito atrás, ou mais de 150
_ticks_ (1,25 s) à frente, o navegador simplesmente pula para o estado do servidor.

**Suavização.** A diferença entre a previsão antiga e a corrigida não aparece de uma vez. Ela vira um deslocamento
visual que some exponencialmente (e^(−12·t), 95% em ~250 ms). Correções enormes, acima de 110 px (um saque novo, um
engasgo longo), aparecem na hora, porque deslizar seria pior.

**Relógio (`TickClock`).** O navegador precisa saber "que horas são no servidor" e ficar à frente o suficiente para
que a tecla chegue **antes** de o servidor simular aquele _tick_.

- A hora do servidor é estimada pelos snapshots que chegam. O filtro segue rápido os pacotes adiantados e devagar os
  atrasados, porque um pacote nunca chega cedo demais, só tarde.
- A vantagem é: uma ida e volta (a estimativa já está meia ida e volta atrasada, e a tecla precisa de mais meia
  para ir) + 2× a variação da ida e volta (como o timer de retransmissão do TCP, RFC 6298) + 10 ms.
- A ida e volta vem dos pings a cada 2 s.

**Quando várias teclas vencem de uma vez** (primeiro snapshot, aba em segundo plano, quadro lento), `advanceTo` roda
os _ticks_ atrasados com as teclas antigas e só aplica as novas no último. Assim a mudança não é marcada num _tick_
que o servidor já passou.

**Espelhamento.** O servidor não sabe de lados de tela: ele tem esquerda (0) e direita (1). Quem está na direita:

- vê o estado espelhado (`mirrorState`: troca os corpos, inverte x e velocidade, troca placar e saque);
- tem as teclas espelhadas antes de sair (`mirrorBits`: ← vira →).

**Por que prever tudo, e não interpolar o adversário?** O desenho inicial previa desenhar o adversário e a bola
"no passado", interpolando entre snapshots. No vôlei, porém, a bola bate no **seu** corpo: com a bola no passado e
você no presente, ela atravessaria a sua cabeça ou quicaria no vazio. Prever o jogo inteiro com o mesmo motor
determinístico deixa bola e jogador coerentes, e a suavização esconde as correções.

**Medido** num simulador de rede milissegundo a milissegundo (`predictor.test.ts`). As medições usam dois bots com
reflexos humanos, três sementes por linha, e latência de ida (a ida e volta é o dobro):

| Latência (ida) | Variação | Correção do próprio corpo em rali | Erro médio da bola prevista | Placar final igual nos 3 |
| -------------: | -------: | --------------------------------: | --------------------------: | :----------------------: |
|           0 ms |     0 ms |                              0 px |                        0 px |           sim            |
|          20 ms |     5 ms |                              0 px |                     0,06 px |           sim            |
|          40 ms |     0 ms |                              0 px |                     0,15 px |           sim            |
|          80 ms |    30 ms |                              0 px |                  1,5–1,8 px |           sim            |
|         150 ms |    50 ms |           22–104 px (após saques) |                  5,2–6,6 px |           sim            |
|         250 ms |    80 ms |                          35–83 px |                      ~20 px |           sim            |

Até ~80 ms de ida (Brasil ↔ Brasil, Brasil ↔ EUA leste) o seu jogador nunca é corrigido e a bola prevista erra
menos de 2 px, invisível numa quadra de 960 px. Acima disso, as correções aparecem logo depois dos saques: o momento
do saque depende de onde a bola do **outro** caiu, e essa informação chega tarde.

## Reconexão

- **Token de cadeira.** No `welcome`, o servidor entrega um token aleatório (128 bits), guardado no `sessionStorage`
  da aba por sala. Um `hello` com esse token volta para a mesma cadeira.
  - `sessionStorage` é por aba: duas abas do mesmo navegador são dois jogadores diferentes, útil para testar.
  - Um F5 mantém o token.
- **Caiu no meio da partida.** O servidor:
  1. para o relógio da partida;
  2. manda a todos o **estado exato em que parou**;
  3. mostra ao outro jogador "Fulano caiu. Esperando voltar…", com os segundos restantes.

  A página de quem caiu tenta de novo sozinha (300 ms, 0,7 s, 1,5 s, 2,5 s, 4 s, 7 s: um pouco mais que os 15 s da
  cadeira). Quando os dois estão de volta: contagem "Volta em 3" e a partida continua de onde parou, sem nenhuma
  rajada de física pelo tempo pausado.

- **F5 no meio da partida.** Enquanto você está numa sala, a barra de endereço mostra `#volei-CÓDIGO`. Depois do F5,
  a página abre a aba online, entra com o apelido lembrado e o token, e retoma a partida. O teste de navegador faz
  exatamente isso.
- **Mesma pessoa em duas abas:** a mais nova fica com a cadeira, e a antiga recebe "Você abriu esta sala em outra aba".
- **Hibernação.** No lobby parado, o objeto pode sair da memória sem derrubar os sockets (API de hibernação de
  WebSocket). Cada socket carrega a própria cadeira num _attachment_ serializado, e o lobby está no armazenamento. Ao
  acordar, o objeto remonta a sala igual; timers não sobrevivem, então cadeiras vazias ganham um novo prazo de 15 s.

## Segurança e limites

| O quê                 | Limite / regra                                                                 |
| --------------------- | ------------------------------------------------------------------------------ |
| Criar sala            | 10 por minuto por IP (`ROOM_LIMIT`), e só a partir do próprio site (`Origin`)  |
| Abrir o WebSocket     | `Origin` obrigatório e igual ao site: outra página não abre socket em seu nome |
| Tamanho de mensagem   | 512 bytes (a maior legítima, o `hello`, tem ~100)                              |
| Mensagens por conexão | Balde de fichas: 90/s, rajada de 180. Acima disso, `rate_limited` e desconexão |
| `hello`               | Até 5 s depois de conectar, senão `timeout`                                    |
| Teclas                | No máximo 1 s no futuro. Atrasadas valem no próximo passo                      |
| Apelido               | Mesmas regras e filtro do ranking, conferidas no servidor                      |
| Token de cadeira      | 128 bits aleatórios (CSPRNG), 32 hex conferidos pelo parser                    |
| Placar                | Só o servidor decide: o navegador nunca envia posição, bola nem pontos         |

## Custo no plano gratuito

Durable Objects com armazenamento SQLite estão disponíveis no **plano gratuito** do Workers, e é esse o tipo usado
aqui (`new_sqlite_classes` na migration). O que conta no uso:

- **Tempo ativo** (GB·s): o objeto fica na memória durante a partida, por causa do loop de física. No lobby parado,
  sem timers pendentes, ele hiberna e não conta tempo.
- **Requisições:** cada criação de sala, cada conexão e as mensagens que chegam por WebSocket, estas cobradas numa
  proporção reduzida (várias mensagens contam como uma requisição). Mensagens que o servidor envia não contam.

Uma partida de 2–3 minutos usa uma fração pequena da franquia diária. Para o volume de um portfólio, a expectativa é
custo zero. Os valores exatos mudam: confira a página de preços de Durable Objects e o painel da Cloudflare.

**Deploys de preview** (branches) não recebem bindings (`"previews": {}`), então não têm Durable Object: a API
responde `503` e a aba online mostra "O modo online não está disponível agora". Os outros jogos seguem funcionando.

## Testes

```bash
npm run check                                  # tudo abaixo, menos o e2e
npx vitest run src/lib/volley-online worker    # só o online
```

- `protocol.test.ts`: códigos de sala, teclas e espelhamento, snapshot (ida e volta), parser estrito.
- `match.test.ts`:
  - linha do tempo das teclas;
  - determinismo (mesma partida duas vezes);
  - uma partida inteira entre bots;
  - teclas atrasadas e adiantadas.
- `predictor.test.ts`:
  - espelhamento, relógio e `jumpTo`;
  - o **simulador de rede** da tabela acima: servidor, dois navegadores e bots trocando mensagens com latência e
    variação, milissegundo a milissegundo.
- `room.test.ts`, a sala inteira com relógio falso:
  - lobby, contagem e cancelamento, rate limit, 30 snapshots/s;
  - partida completa e revanche;
  - pausa e volta com token (estado congelado idêntico);
  - W.O. por tempo e por saída, aba duplicada;
  - hibernação (sala remontada do armazenamento).
- `worker/test/volley.test.ts`: as rotas (criação, colisão de código, `403`/`429`/`503`, encaminhamento do upgrade,
  pré-teste).
- `link.test.ts`: o link da sala e a leitura do `#volei-CÓDIGO`.
- `worker/test/online.e2e.test.ts`: **partida real** contra o `wrangler dev`, com o Durable Object de verdade e
  WebSockets de verdade. Dois bots usam o mesmo `Predictor` e o mesmo `TickClock` do navegador, jogam até 7, um
  deles cai e volta no meio; depois, um terceiro jogador é recusado e uma sala inexistente não abre. Leva ~2 minutos
  e só roda quando pedido:

  ```bash
  npm run build && npx wrangler dev --port 8790      # num terminal
  VOLLEY_E2E_URL=http://localhost:8790 npx vitest run worker/test/online.e2e.test.ts
  ```

Também foi verificado num navegador real (Chromium), com duas pessoas: uma no desktop em português, outra num
celular em inglês pelo link. O roteiro cobriu:

- criar a sala;
- entrar pelo link;
- ficar pronto e jogar;
- F5 no celular no meio da partida (pausa no outro lado, volta automática, "Volta em 3");
- resultado com confete;
- revanche e saída;
- voltar para a campanha no mesmo painel.

Nenhum erro no console.

## Rodar localmente

```bash
npm run preview          # build + wrangler dev em http://localhost:8787 (Worker, D1 e Durable Object locais)
```

Abra duas abas (ou uma aba anônima) em `http://localhost:8787`, crie a sala numa e cole o link na outra. Com
`npm run dev` (só Next.js, sem Worker) a aba online mostra "indisponível", como nos previews.

Atenção: o `wrangler dev` recarrega o Worker quando arquivos mudam, e isso derruba o Durable Object em memória. Uma
partida em andamento volta para o lobby (ver [Limitações](#limitações-conhecidas)).

## Deploy

Nada manual. O `wrangler.jsonc` já declara:

- o binding `VOLLEY_ROOMS` → classe `VolleyRoom` (exportada por `worker/index.ts`);
- a migration `v1-volley-rooms` com `new_sqlite_classes: ["VolleyRoom"]`: o primeiro `wrangler deploy` (ou o deploy
  pela integração com o GitHub) cria a classe na conta, e os seguintes não fazem nada;
- o rate limit `ROOM_LIMIT` (namespace `1003`).

Regras para o futuro: **nunca edite nem remova uma migration já publicada**. Renomear ou apagar a classe exige uma
migration nova (`renamed_classes` / `deleted_classes`). Mudanças de protocolo incompatíveis sobem
`PROTOCOL_VERSION`; abas abertas com o site antigo recebem `bad_version` e pedem para recarregar.

## Limitações conhecidas

- **Ping alto.** Acima de ~120 ms de ida, o seu jogador pode ser corrigido logo depois dos saques (ver a tabela).
  A sala nasce no data center perto de quem a criou; entre continentes o jogo funciona, mas com correções visíveis.
- **Objeto despejado no meio da partida.** Se a Cloudflare tirar o objeto da memória durante uma partida (deploy
  novo, manutenção), a partida em andamento se perde. A sala volta ao lobby com as cadeiras, e os dois podem
  começar outra. O lobby e o placar da sala sobrevivem, porque estão no armazenamento.
- **Navegadores diferentes.** A física usa ponto flutuante; motores JavaScript diferentes podem divergir na última
  casa decimal em funções como `Math.hypot` e `Math.sin`. Isso não afeta o resultado (o servidor decide), no máximo gera uma
  correção mínima, que o arredondamento dos snapshots absorve.
- **Sem espectadores e sem pareamento automático:** ver as próximas fases.

## Próximas fases

2. **Partida rápida:** uma fila (outro Durable Object) que junta dois desconhecidos numa sala nova.
3. **Ranking online (ELO):** resultado gravado pelo servidor no D1 (o placar já é autoritativo, não precisa das
   defesas contra trapaça do ranking local), com a revanche já pronta desta fase.
4. **Acabamento:** emotes rápidos, espectadores (um terceiro socket só de leitura) e indicador de conexão mais rico.
   O ping de cada jogador já aparece no lobby e durante a partida.
