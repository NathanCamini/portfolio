import { Navbar } from '@/components/layout/Navbar';
import { LocaleTransition } from '@/components/motion/LocaleTransition';
import { Bio } from '@/components/sections/Bio';
import { CarShowcase } from '@/components/sections/CarShowcase';
import { Contact } from '@/components/sections/Contact';
import { Hero } from '@/components/sections/Hero';
import { Hobbies } from '@/components/sections/Hobbies';
import { Projects } from '@/components/sections/Projects';
import { VolleyballSection } from '@/components/sections/VolleyballSection';

/**
 * Page composition — mirrors the design's section order:
 * Hero → 01 Bio → 02 Projects → 03 Hobbies (a: AI, b: 3D car, c: volleyball) → 04 Contact.
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
        <Bio />
        <Projects />
        <Hobbies />
        <CarShowcase />
        <VolleyballSection />
        <Contact />
      </LocaleTransition>
    </>
  );
}
