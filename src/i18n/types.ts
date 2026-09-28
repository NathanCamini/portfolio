/**
 * Shape of a translation dictionary. Every locale file must satisfy this
 * interface, so a missing key is a type error instead of a blank on the page.
 */

export interface EducationItem {
  level: string;
  course: string;
  school: string;
  years: string;
  status: string;
  /** `false` renders the animated progress bar (graduate program in progress). */
  done: boolean;
  /** Completion percentage, only meaningful when `done` is false. */
  pct?: number;
}

export interface PastProject {
  year: string;
  type: string;
  title: string;
  body: string;
  stack: string[];
  /** Case-study link. Leave undefined to hide the link. */
  href?: string;
}

export interface FutureProject {
  n: string;
  title: string;
  body: string;
  stage: string;
  pct: number;
}

export interface AiFlow {
  label: string;
  prompt: string;
  result: string;
}

export interface GameStrings {
  title: string;
  start: string;
  you: string;
  cpu: string;
  pYou: string;
  pCpu: string;
  win: string;
  lose: string;
  again: string;
}

/** Copy drawn inside the Siege-style aim trainer canvas. */
export interface TrainerStrings {
  title: string;
  start: string;
  score: string;
  time: string;
  streak: string;
  headshot: string;
  hostage: string;
  rank: string;
  best: string;
  again: string;
}

export interface Dictionary {
  meta: { title: string; description: string };
  nav: { bio: string; projects: string; hobbies: string; contact: string; language: string };
  hero: {
    tag1: string;
    tag2: string;
    /** Fixed start of the headline… */
    titleLead: string;
    /** …followed by endings that rotate with a letter-by-letter animation. */
    titleWords: string[];
    sub: string;
    cta1: string;
    cta2: string;
    scrollHint: string;
  };
  /** Words scrolling in the band between the hero and the bio. */
  marquee: string[];
  bio: {
    label: string;
    title: string;
    p1: string;
    p2: string;
    eduLabel: string;
    edu: EducationItem[];
  };
  projects: {
    label: string;
    title: string;
    tabPast: string;
    tabFuture: string;
    caseLabel: string;
    stageLabel: string;
    past: PastProject[];
    future: FutureProject[];
  };
  hobbies: {
    label: string;
    title: string;
  };
  ai: {
    label: string;
    title: string;
    body: string;
    promptLabel: string;
    resultLabel: string;
    flows: AiFlow[];
  };
  car: {
    label: string;
    title: string;
    body: string;
    hint: string;
    loading: string;
    error: string;
    canvasLabel: string;
  };
  volleyball: {
    label: string;
    title: string;
    body: string;
    open: string;
    closeBtn: string;
    close: string;
    full: string;
    exitFull: string;
    jump: string;
    left: string;
    right: string;
    controls: string;
    canvasLabel: string;
    badge: string;
    play: string;
    fab: string;
    teaserAlt: string;
    game: GameStrings;
  };
  games: {
    label: string;
    title: string;
    body: string;
    mainLabel: string;
    mains: { name: string; role: string }[];
    facts: { value: string; label: string }[];
    trainerTitle: string;
    trainerBody: string;
    controls: string;
    canvasLabel: string;
    trainer: TrainerStrings;
  };
  contact: {
    label: string;
    title: string;
  };
  footer: {
    role: string;
    backToTop: string;
  };
}
