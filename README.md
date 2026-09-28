# Nathan Camini — Portfólio

Landing page bilíngue (PT/EN) construída a partir do design **Nocturne** (Claude Design): biografia, projetos
(passados e futuros) e uma seção de hobbies com um laboratório de IA, um **Porsche 911 em Three.js** guiado pelo
scroll e um **mini-jogo de vôlei de praia**.

```bash
npm install
npm run dev        # http://localhost:3000 → redireciona para /pt ou /en
npm run check      # typecheck + lint + testes
npm run build && npm start
```

Requer Node ≥ 20.9. Em produção, defina `NEXT_PUBLIC_SITE_URL` (URLs canônicas, Open Graph, sitemap).

## Stack

| Pacote                                       | Papel                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `next` 16 (App Router)                       | SSG de `/pt` e `/en`, metadata/SEO, `proxy.ts` para detecção de idioma       |
| `react` 19                                   | UI                                                                           |
| `motion` 13                                  | Reveals no scroll, stagger dos cards, parallax, barra de progresso, expansão |
| `three` + `@react-three/fiber` 9             | Cena WebGL do carro (carregada sob demanda, fora do bundle inicial)          |
| `vitest`, `eslint`, `prettier`, `typescript` | Qualidade                                                                    |

Sem Tailwind e sem biblioteca de i18n: os tokens do design system vivem em `globals.css` (CSS Modules por seção)
e as traduções são objetos TypeScript tipados.

## Estrutura

```
src/
├─ app/
│  ├─ [lang]/layout.tsx      # <html lang>, fonte Inter, metadata + hreflang, SSG de pt/en
│  ├─ [lang]/page.tsx        # composição das seções
│  ├─ globals.css            # tokens Nocturne + classes .btn/.card/.tag/.seg
│  ├─ sitemap.ts, robots.ts
├─ proxy.ts                  # "/" → /pt ou /en (cookie > Accept-Language > padrão)
├─ config/site.ts            # nome, e-mail, redes, cor/acabamento do carro, dificuldade do jogo
├─ i18n/                     # config, tipos, dicionários pt/en, I18nProvider (troca sem remontar)
├─ lib/                      # palette.ts (tokens → canvas/WebGL), scroll.ts
├─ hooks/                    # useTypewriter, useMediaQuery
└─ components/
   ├─ motion/                # Reveal (whileInView), LocaleTransition, easing
   ├─ layout/Navbar          # nav fixa + seletor PT/EN + barra de progresso
   ├─ sections/              # Hero, Bio, Projects, Hobbies (IA), CarShowcase, VolleyballSection, Contact
   ├─ three/
   │  ├─ CarCanvas.tsx       # <Canvas> R3F: luzes, env map local, estrada, render sob demanda
   │  ├─ CarRig.tsx          # ponte React ↔ controller (useFrame)
   │  ├─ CarRigController.ts # lógica scroll × rotação (TS puro, testado)
   │  ├─ useDragRotation.ts  # ponteiro/teclado → intenção de rotação
   │  └─ porsche911/         # modelo procedural: body (loft), wheel, details, materials
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

**i18n.** `/pt` e `/en` são pré-renderizados (SEO + hreflang). A troca de idioma é estado no cliente +
`history.replaceState`: o texto muda na hora e **nada remonta** — a partida e a posição do carro continuam.

**Acessibilidade.** `prefers-reduced-motion` respeitado globalmente (`MotionConfig`), carro controlável por
teclado (setas / Home), texto do terminal de IA exposto por inteiro a leitores de tela, foco gerenciado no jogo.

## Personalização

- Textos: `src/i18n/dictionaries/pt.ts` e `en.ts` (os `[colchetes]` são placeholders do design).
- Contato, cor/acabamento do carro, dificuldade da CPU: `src/config/site.ts`.
- Cores: tokens em `src/app/globals.css` — o canvas do jogo e a cena 3D leem os mesmos tokens.
