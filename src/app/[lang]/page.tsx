import { Cursor } from '@/components/fun/Cursor';
import { QueryIncident } from '@/components/incident/QueryIncident';
import { Navbar } from '@/components/layout/Navbar';
import { LocaleTransition } from '@/components/motion/LocaleTransition';
import { Bio } from '@/components/sections/Bio';
import { CarShowcase } from '@/components/sections/CarShowcase';
import { Contact } from '@/components/sections/Contact';
import { Games } from '@/components/sections/Games';
import { Hero } from '@/components/sections/Hero';
import { HeroMarquee } from '@/components/sections/HeroMarquee';
import { Hobbies } from '@/components/sections/Hobbies';
import { Projects } from '@/components/sections/Projects';
import { VolleyballSection } from '@/components/sections/VolleyballSection';
import { Terminal } from '@/components/terminal/Terminal';
import { VolleyFab } from '@/components/volleyball/VolleyFab';

/**
 * Page composition:
 * Hero → marquee band (the hand-off into the page) → Bio → Projects →
 * Hobbies (AI, 3D car, volleyball, games) → Contact + footer.
 * Overlays: the volleyball button, the terminal (hero button or ' / ~ keys) and
 * QueryIncident, which hides and restores the page's blocks when the hero's
 * DELETE sticker is clicked.
 *
 * The page itself is a Server Component; each section is a small Client
 * Component that reads copy from the i18n context.
 */
export default function Page() {
  return (
    <>
      <Navbar />
      <LocaleTransition>
        <Hero />
        <HeroMarquee />
        <Bio />
        <Projects />
        <Hobbies />
        <CarShowcase />
        <VolleyballSection />
        <Games />
        <Contact />
      </LocaleTransition>
      <VolleyFab />
      <Terminal />
      <QueryIncident />
      <Cursor />
    </>
  );
}
