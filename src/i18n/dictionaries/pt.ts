import type { Dictionary } from '../types';

/**
 * Português (padrão). Os trechos entre [colchetes] são placeholders do design:
 * troque pelos seus dados reais (curso, universidade, anos…).
 */
export const pt: Dictionary = {
  meta: {
    title: 'Nathan Camini — Front-end & UX criativa',
    description:
      'Portfólio de Nathan Camini: desenvolvedor front-end, graduado e pós-graduando. Projetos, experimentos com IA, um 911 em Three.js e um mini-jogo de vôlei de praia.',
  },
  nav: { bio: 'Biografia', projects: 'Projetos', hobbies: 'Hobbies', contact: 'Contato', language: 'Idioma' },
  hero: {
    tag1: 'Front-end · UX criativa',
    tag2: 'Pós-graduando',
    title: 'Construo interfaces que se comportam como experimentos.',
    sub: 'Desenvolvedor front-end graduado em [Curso] e pós-graduando em [Área]. Este site é meu playground: role a página, arraste o carro, jogue uma partida.',
    cta1: 'Ver projetos',
    cta2: 'Jogar vôlei',
    scrollHint: 'Role para explorar',
  },
  bio: {
    label: '01 — Biografia',
    title: 'Da curiosidade por como as coisas funcionam ao código que as faz funcionar.',
    p1: '[Conte aqui como começou: o primeiro contato com programação, o que o levou ao front-end e o tipo de problema que gosta de resolver.]',
    p2: '[Descreva a graduação concluída, o foco da pós-graduação atual e como a pesquisa acadêmica aparece no seu trabalho do dia a dia.]',
    eduLabel: 'Formação acadêmica',
    edu: [
      {
        level: 'Graduação',
        course: '[Nome do curso]',
        school: '[Universidade]',
        years: '20XX – 20XX',
        status: 'Concluída',
        done: true,
      },
      {
        level: 'Pós-graduação',
        course: '[Especialização / Mestrado em …]',
        school: '[Instituição]',
        years: '20XX – hoje',
        status: 'Em andamento',
        done: false,
        pct: 55,
      },
    ],
  },
  projects: {
    label: '02 — Projetos',
    title: 'O que já foi entregue e o que ainda está no caderno.',
    tabPast: 'Portfólio',
    tabFuture: 'Ideias futuras',
    caseLabel: 'Ver estudo de caso',
    stageLabel: 'Estágio',
    past: [
      {
        year: '2025',
        type: 'Web app',
        title: 'Painel de dados em tempo real',
        body: 'Dashboard com gráficos ao vivo, filtros compostos e modo offline para uma equipe de operações.',
        stack: ['React', 'TypeScript', 'WebSocket'],
        href: '#',
      },
      {
        year: '2024',
        type: 'Design system',
        title: 'Biblioteca de componentes',
        body: 'Tokens, componentes acessíveis e documentação interativa usados por três produtos.',
        stack: ['React', 'Storybook', 'CSS vars'],
        href: '#',
      },
      {
        year: '2023',
        type: 'Experimento',
        title: 'Visualizador 3D de produtos',
        body: 'Configurador em WebGL com troca de materiais e captura de imagem direto do navegador.',
        stack: ['Three.js', 'GLSL', 'Vite'],
        href: '#',
      },
    ],
    future: [
      {
        n: 'Ideia 01',
        title: 'Tutor de estudos com IA',
        body: 'Um assistente que transforma artigos da pós em flashcards e perguntas de revisão espaçada.',
        stage: 'Prototipando',
        pct: 45,
      },
      {
        n: 'Ideia 02',
        title: 'Telemetria automotiva em 3D',
        body: 'Reproduzir voltas de track day a partir de dados de GPS e acelerômetro, com o carro em Three.js.',
        stage: 'Pesquisando',
        pct: 20,
      },
      {
        n: 'Ideia 03',
        title: 'Placar inteligente de vôlei',
        body: 'App de placar por voz para partidas na praia, com estatísticas de rally ao final do jogo.',
        stage: 'Esboço',
        pct: 10,
      },
    ],
  },
  hobbies: {
    label: '03 — Hobbies',
    title: 'Três coisas que ocupam o tempo livre e acabam virando código.',
  },
  ai: {
    label: '03a — Inteligência Artificial',
    title: 'A IA como parceira de rascunho.',
    body: 'Uso modelos de linguagem para gerar ideias em quantidade, prototipar rápido e revisar código. A decisão final e a escrita que vai para produção continuam sendo minhas.',
    promptLabel: 'Prompt',
    resultLabel: 'Resultado',
    flows: [
      {
        label: 'Ideação',
        prompt: 'Liste 5 formas de usar dados de telemetria de carros para ensinar física no ensino médio.',
        result: '→ 5 conceitos · 2 viraram protótipo no fim de semana',
      },
      {
        label: 'Prototipagem',
        prompt: 'Escreva a física mínima de um jogo de vôlei 2D: gravidade, colisão bola-jogador e rede.',
        result: '→ rascunho em 10 min · reescrito e testado à mão (é o jogo aqui embaixo)',
      },
      {
        label: 'Revisão',
        prompt: 'Revise este hook React: existem re-renders desnecessários ou listeners que não são removidos?',
        result: '→ 2 problemas reais · 1 falso positivo descartado',
      },
    ],
  },
  car: {
    label: '03b — Carros',
    title: 'Um 911 que anda com o scroll.',
    body: 'A posição horizontal vem da rolagem da página. A rotação vem do seu mouse. São dois grupos 3D separados, então um nunca interfere no outro.',
    hint: 'Arraste para girar · duplo clique para resetar',
    loading: 'Carregando Three.js…',
    error: 'Não foi possível carregar o WebGL.',
    canvasLabel: 'Porsche 911 em 3D. Role a página para movê-lo e arraste para girá-lo.',
  },
  volleyball: {
    label: '03c — Vôlei de praia',
    title: 'Uma partida rápida na areia?',
    body: 'Mini-jogo 1 contra 1 contra o computador. Primeiro a 7 pontos vence.',
    open: 'Abrir mini-jogo',
    closeBtn: 'Fechar jogo',
    close: 'Fechar',
    full: 'Tela cheia',
    exitFull: 'Sair da tela cheia',
    jump: 'Pular',
    left: 'Mover para a esquerda',
    right: 'Mover para a direita',
    controls: '← → ou A D para mover · ↑ W ou espaço para pular',
    canvasLabel: 'Mini-jogo de vôlei de praia',
    game: {
      title: 'Beach Volley',
      start: 'Clique ou aperte espaço para começar',
      you: 'VOCÊ',
      cpu: 'CPU',
      pYou: 'Ponto seu!',
      pCpu: 'Ponto da CPU',
      win: 'Você venceu!',
      lose: 'A CPU venceu',
      again: 'Clique ou espaço para jogar de novo',
    },
  },
  contact: {
    label: '04 — Contato',
    title: 'Tem um projeto estranho o suficiente? Vamos conversar.',
    footNote: 'Feito com React, Three.js e muita areia.',
  },
};
