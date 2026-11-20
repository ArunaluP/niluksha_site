/**
 * "Crystal Edge" aura background — an ALTERNATIVE to the default glass background
 * (.app-bg in globals.css). Not used by default; see the note at the end of
 * globals.css for the one-line switch in src/app/layout.tsx.
 * The layers use multiply blending against #faf8f2. Styles: globals.css (.aura-*).
 */
export function AuraBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="aura-bg">
      <div className="aura-layer aura-layer-1" aria-hidden="true" />
      <div className="aura-layer aura-layer-2" aria-hidden="true" />
      <div className="aura-content">{children}</div>
    </div>
  );
}
