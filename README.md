# Nathan Camini — Portfólio

Landing page bilíngue (PT/EN) de um desenvolvedor back-end, construída a partir do design **Nocturne**:
biografia, projetos (passados e futuros) e hobbies — laboratório de IA, um **Porsche 911 GT3 RS em Three.js** guiado
pelo scroll, um **mini-jogo de vôlei de praia** e um **Peek Trainer** no estilo Rainbow Six Siege.

```bash
npm install
npm run dev        # http://localhost:3000 → abre em /pt ou /en conforme o idioma do sistema
npm run check      # typecheck + lint + testes
npm run preview    # build estático + servidor local da Cloudflare (wrangler) em :8787
npm run deploy     # build estático + publicação no Cloudflare Workers
```

Requer Node ≥ 20.9. O site é um **export estático** (`out/`): não há servidor Node em produção.

## Deploy na Cloudflare

O `wrangler.jsonc` publica `out/` como _static assets_ de um Worker:
`/pt` → `pt.html`, barra final redirecionada, URLs desconhecidas → `404.html` com status 404. O arquivo
`public/_headers` define cache de 1 ano para `/_next/static/*` (arquivos com hash) e headers de segurança básicos.
Só `/api/*` passa pelo código do Worker (`worker/index.ts`); todo o resto sai direto dos arquivos estáticos.

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
| `wrangler`                                   | Preview local e deploy no Cloudflare Workers                                 |
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
├─ config/site.ts            # nome, e-mail, redes, cor/acabamento do carro, dificuldade do jogo
├─ i18n/                     # config, detect (idioma do sistema), dicionários pt/en, I18nProvider
├─ lib/                      # palette.ts (tokens → canvas/WebGL), scroll.ts
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
   ├─ siege/                 # Peek Trainer: engine (TS puro, testado), render, componente
   └─ volleyball/
      ├─ engine/             # física, IA, render — TS puro, sem React (testado)
      ├─ useVolleyballGame.ts# loop de passo fixo, input, resize
      └─ VolleyballGame.tsx  # painel: toolbar, tela cheia, controles touch
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

**i18n.** `/pt` e `/en` são pré-renderizados (SEO + hreflang; `x-default` aponta para `/`, que detecta o idioma
do sistema). A troca de idioma é estado no cliente + `history.replaceState`: o texto muda na hora e **nada remonta**
— a partida e a posição do carro continuam.

**Acessibilidade.** `prefers-reduced-motion` respeitado globalmente (`MotionConfig`), carro controlável por
teclado (setas / Home), texto do terminal de IA exposto por inteiro a leitores de tela, foco gerenciado no jogo.

## Personalização

- Textos: `src/i18n/dictionaries/pt.ts` e `en.ts` (os `[colchetes]` são placeholders do design).
- Contato, cor/acabamento do carro, dificuldade da CPU: `src/config/site.ts`.
- Cores: tokens em `src/app/globals.css` — o canvas do jogo e a cena 3D leem os mesmos tokens.
