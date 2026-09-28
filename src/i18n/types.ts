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
  /** Small caps line above the title (where / when it was built). */
  kicker: string;
  type: string;
  title: string;
  body: string;
  stack: string[];
  /** Case-study link. Leave undefined to hide the link. */
  href?: string;
}

export interface ExperienceItem {
  role: string;
  company: string;
  period: string;
  place: string;
  /** Current job: highlighted dot on the timeline. */
  current?: boolean;
  body: string;
  /** Optional bullet list of main contributions. */
  highlights?: string[];
  stack?: string[];
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

/** Global leaderboard: the name form after a match and the top 10 board. */
export interface RankingStrings {
  button: string;
  title: string;
  subtitle: string;
  points: string;
  scoreHelp: string;
  nameLabel: string;
  namePlaceholder: string;
  save: string;
  saving: string;
  skip: string;
  again: string;
  close: string;
  loading: string;
  empty: string;
  /** `{n}` = position on the board. */
  position: string;
  newBest: string;
  /** `{best}` = the player's standing record. */
  keptBest: string;
  noPoints: string;
  offline: string;
  errors: {
    length: string;
    chars: string;
    letters: string;
    reserved: string;
    offensive: string;
    /** The server's anti-cheat checks refused the match. */
    rejected: string;
    expired: string;
    rateLimited: string;
    unavailable: string;
  };
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
    expLabel: string;
    exp: ExperienceItem[];
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
    ranking: RankingStrings;
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
  /** The interactive terminal opened from the hero (and with the ' / ~ keys). */
  terminal: {
    title: string;
    user: string;
    welcome: string;
    shortcut: string;
    close: string;
    /** Localised file names; the English ones are always accepted too. */
    files: { projects: string; experience: string; education: string; contact: string; resume: string };
    /** Command list shown by `help` (and on open); each entry is clickable. */
    help: { cmd: string; desc: string }[];
    helpFooter: string;
    whoami: string[];
    notFound: string;
    creativity: string;
    noSuchFile: string;
    pdfHint: string;
    sudoDenied: string;
    hire: string[];
    rm: string[];
    rollback: string[];
    gitPush: string[];
    fetching: string;
    fetchError: string;
    downloading: string;
    volleyball: string;
    contactLabels: { email: string; linkedin: string; github: string };
  };
  /** Résumé: the download bar next to the experience timeline, the PDF and the JSON API. */
  cv: {
    title: string;
    blurb: string;
    download: string;
    apiHint: string;
    openJson: string;
    copy: string;
    copied: string;
    /** One-line professional headline under the name (PDF and API). */
    headline: string;
    summary: string;
    summaryLabel: string;
    skillsLabel: string;
    stackLabel: string;
    /** Last line of the PDF. */
    pdfFooter: string;
    docTitle: string;
  };
  footer: {
    role: string;
    backToTop: string;
  };
  /** Easter egg: the hero's DELETE sticker runs and a psql session rolls it back. SQL stays in English. */
  incident: {
    /** HINT under the syntax error: why the `;` before WHERE deleted everything. */
    hint: string;
    /** SQL comments typed at the prompt (without the leading `-- `). */
    lost: string;
    relief: string;
    lesson: string;
    skip: string;
    /** Screen-reader announcement (the terminal itself is decorative). */
    announce: string;
  };
}
