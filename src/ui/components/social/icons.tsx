import { Briefcase, Hash } from 'lucide-react';
import { siFacebook, siInstagram, siTiktok, siX, type SimpleIcon } from 'simple-icons';

/*
 * Network marks for the preview tabs. Brand paths come from simple-icons (CC0).
 * LinkedIn and Slack asked simple-icons to drop their logos, so they get generic
 * lucide glyphs instead of a hand-drawn copy.
 */

function Brand({ icon, className }: { icon: SimpleIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d={icon.path} />
    </svg>
  );
}

export function NetworkIcon({ id, className = 'size-3.5' }: { id: string; className?: string }) {
  switch (id) {
    case 'facebook':
      return <Brand icon={siFacebook} className={className} />;
    case 'x':
      return <Brand icon={siX} className={className} />;
    case 'instagram':
      return <Brand icon={siInstagram} className={className} />;
    case 'tiktok':
      return <Brand icon={siTiktok} className={className} />;
    case 'linkedin':
      return <Briefcase className={className} />;
    case 'slack':
      return <Hash className={className} />;
    default:
      return null;
  }
}
