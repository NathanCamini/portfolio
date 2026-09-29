# Vôlei online 1×1

Vôlei **uma pessoa contra outra, em tempo real**. Um servidor autoritativo (um Durable Object da Cloudflare por sala)
roda a física, e cada navegador **prevê** a partida para responder ao teclado na hora. Este documento explica o que
foi feito, por quê, e como testar, rodar e publicar.

- **Fase 1:** salas por link (criar, mandar o link, jogar), reconexão, revanche.
- **Fase 2:** [partida rápida](#partida-rápida), uma fila que junta dois desconhecidos numa sala nova.
- **Fase 3:** [ranking online](#ranking-online) com Elo: a partida rápida vale pontos e a fila junta gente de nível
  parecido.
- **Fase 4:** [reações, espectadores e indicador de conexão](#reações-espectadores-e-conexão).

- [Como se joga](#como-se-joga)
- [Arquitetura](#arquitetura)
- [Onde está cada coisa](#onde-está-cada-coisa)
- [API HTTP](#api-http)
- [Protocolo WebSocket](#protocolo-websocket)
- [Ciclo de vida da sala](#ciclo-de-vida-da-sala)
- [Partida rápida](#partida-rápida)
- [Ranking online](#ranking-online)
- [Reações, espectadores e conexão](#reações-espectadores-e-conexão)
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

**Partida rápida:** na aba **Online · 1×1**, digite um apelido e clique em **Partida rápida** (ou aperte Enter). A
tela mostra "Procurando adversário…" com o tempo de espera; assim que outra pessoa entra na fila, as duas vão para uma
sala nova, já prontas, e a contagem começa.

**Com um amigo:**

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
                        60×/s         │  └ RoomCore (room.ts)        │      60×/s
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
├─ queue.ts                       # MatchQueue: a fila da partida rápida (quem espera, pareamento)
├─ predictor.ts                   # Predictor (previsão + reconciliação + suavização), TickClock, mirrorState
└─ testing.ts                     # bots e gerador pseudoaleatório para os testes
worker/
├─ volley.ts                      # rotas HTTP /api/volley/rooms, /queue, /ratings e /live
├─ live.ts                        # a vitrine: grava e lista as partidas ao vivo (D1)
├─ volley-room.ts                 # o Durable Object VolleyRoom (adaptador de RoomCore)
├─ volley-queue.ts                # o Durable Object VolleyQueue (adaptador de MatchQueue)
└─ test/volley.test.ts            # rotas; test/online.e2e.test.ts: partida real contra `wrangler dev`
src/components/volleyball/
├─ VolleyballGame.tsx             # painel: abas Campanha / Endless / Online (cada aba monta só o seu jogo)
├─ TouchPad.tsx                   # botões na tela, usados pelo jogo local e pelo online
└─ online/
   ├─ useOnlineVolley.ts          # conexão, reconexão, loop de previsão e desenho
   ├─ OnlineVolley.tsx (+ .css)   # telas: início, procurando, lobby, contagem, pausa, reconectando, resultado
   └─ link.ts                     # link da sala (#volei-CÓDIGO)
```

O motor ganhou o mínimo para dois humanos:

- `stepGame(g, dt, input, rng, opponent?)`: com `opponent`, o corpo da direita é guiado por esse input em vez da IA.
- `kickoff(g, lado)`: começa a partida com saque de um lado.
- O estágio `online` (primeiro a 7).

O modo contra a CPU continua idêntico, e os testes de dificuldade do motor seguem passando.

## API HTTP

| Rota                          | Resposta                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/volley/rooms`      | `201 { "code": "K7MPQ" }`: sala nova. `403` de outro site, `429` acima do limite, `503` sem DO.          |
| `GET /api/volley/rooms/:code` | Com `Upgrade: websocket`: `101`, o WebSocket da sala. `Origin` precisa ser o próprio site (`403`).       |
| `GET /api/volley/rooms/:code` | Sem upgrade: `200 { code, phase, players }` ou `404`. A página checa isso antes de abrir o socket.       |
| `GET /api/volley/queue`       | Com `Upgrade: websocket`: `101`, o WebSocket da fila. `Origin` obrigatório (`403`).                      |
| `GET /api/volley/queue`       | Sem upgrade: `204`, ou `429` / `503`. O pré-teste da partida rápida.                                     |
| `GET /api/volley/ratings`     | `200 { top, me? }`: o ranking online (top 10); `?me=<sha-256 do id>` inclui a sua posição. `503` sem D1. |
| `GET /api/volley/live`        | `200 { matches }`: até 10 partidas rápidas em andamento, as mais assistidas primeiro. `503` sem D1.      |

O pré-teste por HTTP existe porque um WebSocket recusado não diz o motivo ao navegador. Com ele, a página mostra
"sala não encontrada", "sala cheia" ou "online indisponível".

**Códigos de sala:** 5 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sem I, L, O, 0 e 1, que se confundem ao ditar
ou digitar no celular). São 28,6 milhões de combinações sorteadas com o gerador criptográfico da plataforma. Uma
colisão com sala existente é rara, e o Worker tenta outra (até 5 vezes).

## Protocolo WebSocket

Mensagens JSON, uma por frame. Toda mensagem do cliente passa por `parseClientMessage`, que é estrita: confere tipos,
faixas e tamanho, e remonta a mensagem só com os campos conhecidos. Qualquer coisa fora disso derruba a conexão com
`bad_message`. **Versão do protocolo: 2** (a 2 trouxe o snapshot binário, os 60 snapshots/s e o `opp`). Um
cliente antigo recebe `bad_version`, e a página pede para recarregar.

**Cliente → servidor**

| Mensagem                          | Quando                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `hello { v, name, token?, pid? }` | Primeira mensagem (até 5 s). `token` recupera a cadeira depois de cair; `pid` identifica o jogador no ranking. |
| `ready { ready }`                 | Pronto / cancelar, no lobby e depois de uma partida (revanche).                                                |
| `input { tick, bits }`            | Mudança de teclas, valendo a partir de `tick`. `bits`: 1 ← · 2 → · 4 pulo                                      |
| `ping { c, rtt? }`                | A cada 2 s. `c` volta no `pong`, e `rtt` é o ping medido, mostrado a todos.                                    |
| `leave`                           | Sair da sala. No meio da partida, conta como W.O.                                                              |
| `emote { id }`                    | Uma reação (`EMOTES[id]`, 0–5). Só jogadores; mais de uma a cada 1,5 s é descartada.                           |
| `hello { v, name, watch: true }`  | Entrar como **espectador** (sem cadeira; o nome é ignorado).                                                   |

**Servidor → cliente**

| Mensagem                        | Quando                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `welcome { side, token, room }` | Cadeira confirmada (0 = esquerda, 1 = direita) e o token para voltar a ela.                                                                               |
| `room { room }`                 | O lobby mudou: fase, cadeiras (nome, conectado, pronto, ping), tempo restante, placar da sala, último resultado.                                          |
| `state { s }`                   | Snapshot autoritativo da partida: 60 por segundo, e na hora quando sai um ponto. Vai como **frame binário** (abaixo).                                     |
| `opp { tick, bits }`            | O adversário mudou de teclas, valendo a partir de `tick`. Repassado no instante em que o servidor recebe o `input` dele.                                  |
| `pong { c }`                    | Resposta ao ping.                                                                                                                                         |
| `watching { room }`             | Entrou como espectador: a sala; depois vêm os snapshots e as reações, como para os jogadores.                                                             |
| `emote { side, id }`            | Um jogador reagiu; vai para todos na sala, espectadores incluídos.                                                                                        |
| `error { code }`                | `bad_message`, `bad_version`, `invalid_name`, `room_full`, `room_not_found`, `rate_limited`, `replaced`, `timeout`. O servidor fecha o socket em seguida. |

**Snapshot:** `tick`, posição e velocidade dos três corpos (arredondadas a 1/1000 px), placar, fase do rali, tempo
da fase, relógio da partida, quem saca, quem fez o último ponto e **as teclas que cada jogador segura** (o
navegador usa as do adversário para prevê-lo).

**Snapshot binário.** É a mensagem mais frequente, então vai num frame binário de **68 bytes** em vez de ~200 de
JSON: `u8` tipo, `u32` tick, 12 × `i32` dos corpos ×1000, placar, fase, tempos ×1000, sacador, último a pontuar,
teclas (`encodeSnapshot` / `decodeSnapshot` em `protocol.ts`). Como todo número do snapshot já vem arredondado a
1/1000 (e nunca −0), dividir o inteiro por 1000 devolve **exatamente** o mesmo número: a quantização continua
bit a bit. A 60 por segundo, são uns 4 KB/s por jogador. O resto das mensagens continua em JSON.

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

## Partida rápida

```
 Navegador A ──WebSocket──┐                                   ┌──▶ sala nova "K7MPQ" ◀── A e B entram
                          ├──▶ Durable Object "fila" (global) ─┤      (a mesma sala da fase 1)
 Navegador B ──WebSocket──┘     2 na fila → abre uma sala      └──▶ { t: 'matched', code } para os dois
```

- **Uma fila para todo mundo:** um Durable Object só (`idFromName('global')`), classe `VolleyQueue`. Para o volume
  de um portfólio, um objeto dá conta com folga (ele só troca poucas mensagens por pessoa).
- **Protocolo:** o navegador abre `GET /api/volley/queue` (WebSocket) e manda `join { v, name }`. O servidor responde
  `queued`, e depois `matched { code }`, fechando o socket em seguida; ou `error { code }` (`invalid_name`,
  `bad_version`, `bad_message`, `rate_limited`, `timeout`, `unavailable`).
- **Pareamento por nível** (fase 3): o mais antigo da fila escolhe, entre os outros, quem tem o rating mais
  próximo do dele, desde que a diferença caiba na **janela**: ±150 na hora, e mais 10 pontos por segundo de espera
  (±450 depois de 30 s; em uns 2 minutos, qualquer um). Se ninguém cabe, o próximo da fila tenta; quem sobra é
  reavaliado a cada 2 s. O objeto tira os dois da fila **antes** de abrir a sala (`openRoom`, a mesma função do
  `POST /rooms`, agora com `rated: true`), então um `join` que chega enquanto a sala abre não é pareado de novo com
  eles. Se a sala não abrir, os dois recebem `unavailable`.
- **Depois do pareamento é uma sala normal**, com tudo da fase 1 (reconexão, pausa, W.O., revanche). O navegador:
  - entra na sala e já manda `ready`, então a contagem começa assim que os dois chegam;
  - não mostra o link de compartilhar (é uma sala de desconhecidos) e troca o título por "Adversário encontrado!";
  - **se o adversário não aparecer em 10 s** (fechou a aba no meio do pareamento), sai da sala e volta para a fila
    sozinho. O mesmo vale se ele sair antes da partida começar.
- **Hibernação:** quem espera sozinho não custa nada. Cada socket guarda no _attachment_ se está na fila e desde
  quando; um objeto que acorda remonta a fila na mesma ordem.
- **Cancelar** fecha o socket da fila, e a pessoa sai da fila na hora.

## Ranking online

Só a **partida rápida** vale ranking: numa sala com um amigo, os dois escolhem quem enfrentam, e seria fácil
combinar resultados. O lobby diz qual é o caso ("Vale ranking" / "Amistosa: não vale ranking").

- **Quem é quem:** cada navegador guarda um id aleatório de 128 bits (`localStorage`, `online/player.ts`) e o manda
  no `hello` da sala e no `join` da fila (`pid`). O D1 guarda só o **SHA-256** do id: quem lê a tabela não consegue
  jogar como ninguém. O rating é do navegador, qualquer que seja o apelido; o nome mostrado é o da última partida.
- **Elo** (`src/lib/volley-online/elo.ts`): todo mundo começa com **1000**. Quem vence ganha K × (1 − chance que
  tinha de vencer); quem perde, o equivalente. Ganhar de alguém 300 pontos acima vale ~27; de alguém 300 abaixo,
  ~5. K é 48 nas 10 primeiras partidas (para achar o nível rápido) e 32 depois; o rating não cai abaixo de 100.
  W.O. conta como derrota de quem saiu.
- **O servidor grava**: quando a partida termina, a sala (Durable Object) lê os dois ratings, calcula e escreve as
  duas linhas e um registro da partida numa transação do D1 (`worker/ratings.ts`, tabelas `online_ratings` e
  `online_results`, migration `0004`). O resultado volta para os dois jogadores com antes/depois ("Rating: 1024 (+24)").
- **Não vale ranking** (a sala dá "amistosa" sozinha): sala criada com link, os dois lados com o mesmo `pid` (duas
  abas do mesmo navegador), os dois do **mesmo IP** (`CF-Connecting-IP`), ou um lado sem `pid`. Isso barra alguém
  subindo o próprio rating contra si mesmo em duas abas.
- **Placar:** `GET /api/volley/ratings` → top 10 por rating (empate: quem chegou primeiro). Com `?me=<sha-256 do
id>` vem também a posição de quem pergunta — a página manda o hash, nunca o id. Na aba online, o botão
  **Ranking online** mostra os dois.
- **No lobby** o rating de cada um aparece ao lado do nome (a sala busca no D1 quando a pessoa entra).

O que isso **não** impede: alguém com dois navegadores em duas redes diferentes jogando contra si mesmo. Para um
portfólio, o custo (duas conexões, partidas reais de 7 pontos) já tira a graça; o próximo passo seria limitar
quantas partidas por dia contam entre o mesmo par.

## Reações, espectadores e conexão

**Reações.** Seis emoji (👍 👏 😂 😮 🔥 😅, `EMOTES` em `protocol.ts`), pelas teclas **1–6** ou pela barra de botões
(sobre a quadra no desktop, embaixo dela no celular), da contagem até o resultado. A sala manda `emote { side, id }`
para todo mundo e o navegador mostra um balão sobre o jogador por 2,2 s. Quem reagiu vê o balão do seu lado (a
esquerda); o espectador vê cada um sobre o seu lado da quadra. Só jogadores reagem, e no máximo uma vez a cada 1,5 s
(o resto é descartado sem erro): não dá para inundar a tela do outro.

**Espectadores.** Quem abre o link de uma sala **cheia** assiste em vez de ver "sala cheia":

- entra com `hello { watch: true }` e recebe `watching { room }`, depois os mesmos snapshots e reações dos jogadores;
- não joga nem reage: fora `ping` e `leave`, qualquer mensagem de espectador fecha o socket com `bad_message`;
- não prevê nada: o `SnapshotBuffer` (`spectator.ts`) desenha **um snapshot atrás**, deslizando entre os dois
  últimos (a 60 por segundo, ~17 ms de atraso), e mostra na hora os saltos grandes (o reinício do saque);
- vê um cartão com "Nathan × Maria" entre os ralis, a pausa se alguém cair, e o resultado;
- pode sair a qualquer momento, inclusive trocando de aba (para um jogador, isso seria W.O., então as abas travam
  só para quem joga);
- até **20** por sala (`MAX_SPECTATORS`); os jogadores veem quantos estão assistindo (👁 2);
- sobrevive à hibernação: o _attachment_ do socket guarda `side: 'watch'`, e a sala o reconecta ao acordar. Uma sala
  só com espectadores não é apagada pelo alarme.

**Conexão.** Durante a partida, o canto da quadra mostra três barrinhas para cada jogador, calculadas a partir da ida
e volta que cada um mede: verde abaixo de 80 ms, amarelo até 160 ms, vermelho acima. Você vê a sua e a do
adversário, então dá para saber de quem é o lag.

## Ao vivo

O botão **Ao vivo** (com um ponto vermelho pulsando e quantas partidas há agora) abre a lista das partidas rápidas
em andamento: "Nathan 3 × 2 Maria · 👁 1 · Assistir". Assistir entra na sala como espectador, igual a abrir o link de
uma sala cheia.

- **Só partidas rápidas.** Salas criadas por link são amistosas e privadas: nunca aparecem. Uma sala da fila já é
  pública por natureza (qualquer um cai nela).
- **Quem publica é a sala.** `RoomCore` monta um `LiveSummary` (apelidos, placar, fase, espectadores) e chama
  `host.live(resumo)` quando ele muda: início da contagem, cada ponto, pausa e volta, espectador entrando ou saindo.
  No fim (resultado, W.O., sala vazia) manda `null`, e a linha some.
- **Batimento.** Mesmo sem mudança, a sala republica a cada 30 s (`NET.LIVE_HEARTBEAT_MS`). Uma linha sem notícia
  há mais de 75 s (`NET.LIVE_STALE_MS`) não aparece mais e é apagada na próxima escrita: se o objeto sumir sem
  avisar (deploy, despejo), a vitrine se limpa sozinha.
- **Onde fica.** Na tabela `online_live` do D1 (`migrations/0005_online_live.sql`, criada pelo Worker na primeira
  vez, como as outras). Cada escrita é um lote: grava ou apaga a linha da sala e varre as velhas. O Durable Object
  encadeia as escritas numa fila de promessas, para um ponto e o apito final não chegarem invertidos; uma escrita
  que falha é refeita pelo próximo ponto ou batimento. Nada disso atrasa a partida: não se espera o banco.
- **Custo.** Algumas dezenas de escritas por partida (pontos, espectadores e batimentos), bem dentro do plano gratuito do D1.
- **Na página.** A lista pede `GET /api/volley/live` a cada 5 s enquanto está aberta; o contador do botão, a cada
  15 s, só na tela inicial da aba online. Sem D1 (previews), a lista diz que não há partidas.

## Servidor autoritativo

- **Passo fixo de 120 Hz, igual ao jogo local.** O objeto roda quantos passos de 1/120 s couberem no tempo real
  passado (no máximo 250 ms por vez, sem rajada depois de um engasgo), e **dorme exatamente até o próximo tick de
  snapshot** (`RoomCore.loop` devolve quantos ms faltam). Antes era um `setInterval` de 60 Hz, que rodava 2 passos
  por vez: um snapshot podia sair até 16 ms depois do tick dele.
- **Teclas com hora marcada.** Cada `input` diz em qual _tick_ passa a valer. O servidor guarda uma linha do tempo
  por jogador (`InputTimeline`) e aplica a tecla exatamente naquele passo, o mesmo em que o navegador já a aplicou
  na previsão.
  - Uma tecla atrasada vale no próximo passo possível.
  - Uma marcada mais de 1 s no futuro é recusada.
- **Determinismo.** No modo online o motor não usa nenhum número aleatório: o mesmo início com as mesmas teclas dá
  sempre a mesma partida. Os testes provam isso rodando a mesma partida duas vezes.
- **60 snapshots por segundo** (um a cada 2 passos; eram 30). Em média, cada snapshot chega uns 8 ms mais novo.
- **Eventos na hora.** Quando a fase muda (um ponto, o saque voltando ao jogo, o apito final), o estado sai
  **imediatamente**, fora do ritmo, via `sync()`: o servidor adota o mesmo estado arredondado que envia.
- **Teclas do adversário na hora.** Ao receber um `input`, a sala o agenda e repassa ao outro jogador como
  `opp { tick, bits }`, com o _tick_ em que ele vale de fato (um atrasado vale no próximo). Antes o navegador só
  descobria a mudança pelo campo `inputs` do snapshot seguinte: até 33 ms de espera pelo snapshot, mais até 16 ms do
  `setInterval`, e sem o _tick_ exato.
- **Serializa uma vez.** Um `broadcast` codifica a mensagem uma vez só (`encodeServerMessage`) e manda o mesmo texto
  (ou os mesmos bytes) para as duas conexões; antes era um `JSON.stringify` por conexão.
- **Quantização.** O snapshot arredonda posições e velocidades a 1/1000 px. Para o navegador e o servidor
  continuarem idênticos, o servidor **adota o próprio estado arredondado** a cada tick de snapshot (e também ao
  pausar e nos eventos fora do ritmo), e o navegador **faz o mesmo arredondamento nos mesmos ticks** quando prevê.
  Com as mesmas teclas, a previsão é bit a bit igual ao servidor. Sem isso, um pulo previsto pelo navegador divergia
  por arredondamento, e o seu próprio jogador "tremia" nas correções.

## Netcode no navegador

O que o jogador vê é uma **previsão**: o navegador roda a mesma física localmente, alguns _ticks_ à frente do
servidor, e corrige quando chega a verdade.

**Predição (`Predictor`).** A cada quadro:

- lê as teclas;
- avança a simulação até o _tick_ alvo;
- aplica as próprias teclas na hora;
- para o adversário, usa a **linha do tempo das teclas dele**: o que cada snapshot diz que ele segurava, mais cada
  mudança repassada pelo servidor (`opp`), no _tick_ exato;
- quando as teclas mudam, manda `input { tick, bits }` com o _tick_ em que a mudança foi aplicada.

**Reconciliação.** Quando chega um snapshot (que já é "passado", com meia ida e volta de atraso), ou uma mudança de
tecla do adversário que cai num _tick_ que já foi previsto:

1. volta o jogo para o **último snapshot**;
2. **refaz a previsão** até o presente com as duas linhas do tempo: as próprias teclas gravadas e as do adversário.

O `opp` chega antes do snapshot que traria a mesma informação, então a jogada do outro aparece mais cedo, e a bola
que ela muda também. Se a previsão estiver muito atrás, ou mais de 150 _ticks_ (1,25 s) à frente, o navegador
simplesmente pula para o estado do servidor. Um snapshot mais velho que o último recebido é ignorado.

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

**Medido** num simulador de rede milissegundo a milissegundo (`predictor.test.ts`): o servidor, dois navegadores e
dois bots com reflexos humanos, cada mensagem atrasada pela latência de ida (a ida e volta é o dobro) mais uma
variação aleatória, e cada direção de cada conexão entregando **em ordem**, como o TCP. Média de três sementes. O
erro é o que a tela mostra para cada _tick_ (depois das correções que já tinham chegado) contra a verdade do
servidor. "Antes" é o esquema anterior: 30 snapshots/s, teclas do adversário só pelos snapshots, ponto no próximo
snapshot.

| Latência (ida) | Variação | Próprio corpo corrigido | Bola: antes → depois | Adversário: antes → depois |
| -------------: | -------: | ----------------------: | -------------------: | -------------------------: |
|           0 ms |     0 ms |                    0 px |             0 → 0 px |                 0,6 → 0 px |
|          40 ms |     0 ms |                    0 px |       0,15 → 0,06 px |               4,5 → 2,7 px |
|          80 ms |    30 ms |                    0 px |       1,55 → 0,84 px |             17,4 → 11,9 px |
|         150 ms |    50 ms |                    0 px |       6,14 → 3,73 px |             38,4 → 30,3 px |
|         250 ms |    80 ms |                até 7 px |       18,3 → 12,8 px |             62,6 → 56,8 px |

O placar final dos dois navegadores bate com o do servidor em todas as linhas. O **seu** jogador nunca é corrigido
até 150 ms: as suas teclas chegam ao servidor antes do _tick_ delas, e a previsão é bit a bit igual. O que ainda
erra é o que depende do outro: você só sabe da jogada dele depois de ida e volta dele até o servidor e do servidor
até você. O repasse (`opp`) e os 60 snapshots/s cortam 35–60% do erro da bola e 10–40% do erro do adversário.

> Correção de uma versão anterior deste documento: a tabela antiga mostrava "22–104 px de correção do próprio corpo
> depois dos saques" a 150 ms. Era um defeito do simulador, não do jogo: ele atrasava cada mensagem de forma
> independente, e às vezes um snapshot velho chegava depois de um novo. O navegador antigo voltava para esse snapshot
> e perdia teclas. Um WebSocket (TCP) nunca reordena mensagens, então isso não acontecia de verdade. Agora o
> simulador entrega em ordem, e o `Predictor` também ignora um snapshot mais velho que o último.

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
| Partida rápida        | 20 por minuto por IP (`QUEUE_LIMIT`, pré-teste e socket contam)                |
| Mensagens na fila     | Só o `join`; mais de 4 mensagens num socket da fila, `rate_limited`            |
| Abrir o WebSocket     | `Origin` obrigatório e igual ao site: outra página não abre socket em seu nome |
| Tamanho de mensagem   | 512 bytes (a maior legítima, o `hello`, tem ~100)                              |
| Mensagens por conexão | Balde de fichas: 90/s, rajada de 180. Acima disso, `rate_limited` e desconexão |
| `hello`               | Até 5 s depois de conectar, senão `timeout`                                    |
| Teclas                | No máximo 1 s no futuro. Atrasadas valem no próximo passo                      |
| Apelido               | Mesmas regras e filtro do ranking, conferidas no servidor                      |
| Token de cadeira      | 128 bits aleatórios (CSPRNG), 32 hex conferidos pelo parser                    |
| Placar                | Só o servidor decide: o navegador nunca envia posição, bola nem pontos         |
| Reações               | Só jogadores, uma a cada 1,5 s (as extras são descartadas)                     |
| Espectadores          | Até 20 por sala; só `ping` e `leave`                                           |

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

- `protocol.test.ts`: códigos de sala, teclas e espelhamento, snapshot (ida e volta, e o frame binário de 68 bytes
  decodificando bit a bit, sinal do zero incluído), parser estrito.
- `match.test.ts`:
  - linha do tempo das teclas;
  - determinismo (mesma partida duas vezes);
  - uma partida inteira entre bots;
  - teclas atrasadas e adiantadas.
- `predictor.test.ts`:
  - espelhamento, relógio e `jumpTo`;
  - uma tecla do adversário (`opp`) que cai no passado: a previsão refaz e fica bit a bit igual ao servidor;
  - snapshot mais velho que o último é ignorado;
  - o **simulador de rede** da tabela acima: servidor, dois navegadores e bots trocando mensagens com latência e
    variação, milissegundo a milissegundo, em ordem como o TCP; e a comparação antes/depois (o novo esquema tem que
    errar pelo menos 25% menos na bola e 20% menos no adversário).
- `room.test.ts`, a sala inteira com relógio falso:
  - lobby, contagem e cancelamento, rate limit, 60 snapshots/s e o laço que dorme até o próximo snapshot;
  - teclas repassadas ao adversário (`opp`) com o _tick_ efetivo, e o ponto mandado na hora;
  - partida completa e revanche;
  - pausa e volta com token (estado congelado idêntico);
  - W.O. por tempo e por saída, aba duplicada;
  - hibernação (sala remontada do armazenamento).
- `room.test.ts` (fase 4): espectador numa sala cheia (sala, snapshots, contagem para os jogadores), espectador não
  joga, limite de 20, reação para todos com o intervalo mínimo, espectador de volta depois da hibernação.
- `spectator.test.ts`: um snapshot atrás deslizando pela metade do caminho, salto de saque mostrado na hora,
  snapshot velho ignorado.
- `queue.test.ts`, a fila:
  - pareamento por ordem de chegada, o terceiro espera o quarto;
  - quem desiste sai da fila;
  - um `join` que chega enquanto a sala abre não é pareado duas vezes;
  - sala que não abre, apelido ruim, versão antiga, lixo, excesso de mensagens, socket mudo;
  - hibernação (fila remontada dos sockets, na ordem);
  - ratings próximos primeiro, janela que abre com a espera, quem desiste durante a busca do rating.
- `elo.test.ts`: chances, K de novato, ganho mínimo, piso, os dois lados.
- `room.test.ts` (fase 3): rating no lobby, resultado gravado com a variação dos dois, e os casos que não valem
  (sala amistosa, mesmo navegador, mesmo IP, sem id); sala continua ranqueada depois de hibernar.
- `worker/test/ratings.test.ts`: o SQL de verdade (SQLite do Node): começa sem rating, grava os dois lados,
  acumula, guarda só o hash, `GET /api/volley/ratings` com e sem `?me`.
- `room.test.ts` (vitrine): uma sala ranqueada publica na contagem, nos pontos e com espectadores, e manda `null`
  quando alguém sai; o batimento nunca passa de 30 s; uma sala amistosa nunca publica.
- `worker/test/live.test.ts`: o SQL da vitrine (ordem por espectadores, remoção, linhas velhas escondidas e
  varridas) e a rota `GET /api/volley/live` (`200`, e `503` sem D1).
- `worker/test/volley.test.ts`: as rotas (criação, colisão de código, `403`/`429`/`503`, encaminhamento do upgrade,
  pré-teste), da sala e da fila.
- `link.test.ts`: o link da sala e a leitura do `#volei-CÓDIGO`.
- `worker/test/online.e2e.test.ts`: **partida real** contra o `wrangler dev`, com o Durable Object de verdade e
  WebSockets de verdade. Dois bots usam o mesmo `Predictor` e o mesmo `TickClock` do navegador, jogam até 7, um
  deles cai e volta no meio; outros dois se encontram pela partida rápida, jogam, um desiste e o ranking do D1
  registra a vitória e a derrota (e a sala aparece em `/api/volley/live` durante a partida e some depois); um terceiro jogador é recusado e
  uma sala inexistente não abre; um espectador assiste uma partida real (~60 snapshots/s) e vê a reação de um
  jogador. Leva ~2 minutos
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

E a partida rápida, também com duas pessoas (desktop em PT, celular em EN):

- procurar, cancelar e procurar de novo;
- Enter no campo do apelido (sem código) inicia a busca;
- os dois pareados, contagem e partida sem clicar em "pronto";
- um adversário que é pareado mas nunca entra na sala: depois de 10 s a pessoa volta sozinha para a fila.

E a fase 4, com três pessoas (duas jogando, uma assistindo pelo link da sala cheia):

- o espectador vê "Assistindo · Nathan × Maria", depois a partida, e sai trocando de aba;
- tecla 5 (🔥) de um jogador e o botão 😂 do outro no celular: cada balão aparece do lado certo para os três;
- barrinhas de conexão dos dois jogadores e o 👁 com o número de espectadores, que some quando ele sai.

E a vitrine, com três pessoas (desktop jogando uma partida rápida contra um bot de outro IP, celular assistindo):

- sem partidas, a lista mostra o aviso de vazio;
- com a partida em andamento, o botão mostra "Live 1" e a lista "Robo Rival 0 × 0 Nathan · Watch";
- Watch leva direto à tela de espectador (👁 1 para os jogadores);
- quando o bot sai, o espectador vê "Nathan wins".

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

- os bindings `VOLLEY_ROOMS` → classe `VolleyRoom` e `VOLLEY_QUEUE` → classe `VolleyQueue` (exportadas por
  `worker/index.ts`);
- as migrations `v1-volley-rooms` e `v2-volley-queue` (`new_sqlite_classes`): o deploy cria cada classe na conta uma
  vez, e os seguintes não fazem nada;
- os rate limits `ROOM_LIMIT` (namespace `1003`) e `QUEUE_LIMIT` (namespace `1004`).

O ranking online usa o mesmo banco D1 do ranking dos mini-jogos: as tabelas novas (`0004_online_ratings.sql`) são
criadas pelo próprio Worker na primeira vez que precisar, como as outras. Previews não têm banco: tudo vira amistoso.

Regras para o futuro: **nunca edite nem remova uma migration já publicada**. Renomear ou apagar a classe exige uma
migration nova (`renamed_classes` / `deleted_classes`). Mudanças de protocolo incompatíveis sobem
`PROTOCOL_VERSION`; abas abertas com o site antigo recebem `bad_version` e pedem para recarregar.

## Limitações conhecidas

- **Ping alto.** O seu jogador fica exato até ~150 ms de ida, mas a bola e o adversário são previsões, e o erro
  cresce com a latência (ver a tabela): acima de ~150 ms, correções ficam visíveis. A sala nasce no data center perto
  de quem a criou; entre continentes o jogo funciona, mas com o adversário "escorregando" de vez em quando.
- **Objeto despejado no meio da partida.** Se a Cloudflare tirar o objeto da memória durante uma partida (deploy
  novo, manutenção), a partida em andamento se perde. A sala volta ao lobby com as cadeiras, e os dois podem
  começar outra. O lobby e o placar da sala sobrevivem, porque estão no armazenamento.
- **Navegadores diferentes.** A física usa ponto flutuante; motores JavaScript diferentes podem divergir na última
  casa decimal em funções como `Math.hypot` e `Math.sin`. Isso não afeta o resultado (o servidor decide), no máximo gera uma
  correção mínima, que o arredondamento dos snapshots absorve.
- **Fila única, sem região:** a fila olha o rating, não a distância. Com pouca gente, a janela abre e junta
  quem estiver lá, perto ou longe.
- **Corrida rara no rating:** ler e gravar o rating são duas idas ao D1. Se o mesmo jogador terminar duas partidas
  rápidas no mesmo instante (duas abas, duas salas), uma atualização pode se perder.
- **Vitrine só com partidas rápidas.** Uma partida amistosa (sala por link) só é assistida por quem tem o link. A
  lista também atrasa até 5 s (a busca periódica) e mostra no máximo 10 partidas.

## Próximas fases

2. ~~**Partida rápida**~~: feita (ver [Partida rápida](#partida-rápida)).
3. ~~**Ranking online (Elo)**~~: feito (ver [Ranking online](#ranking-online)).
4. ~~**Acabamento**~~: feito (ver [Reações, espectadores e conexão](#reações-espectadores-e-conexão)).
5. ~~**Vitrine ao vivo**~~: feita (ver [Ao vivo](#ao-vivo)).

Ideias para depois: replays (a partida é determinística: guardar as
teclas basta para reproduzi-la inteira) e salas com melhor de 3.
