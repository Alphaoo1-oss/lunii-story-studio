// Aperçu de l'écran de la Lunii (320×240, 4:3) : l'image telle qu'elle s'affichera, ou à défaut
// le picto par défaut (libellé sur fond coloré) que l'export créera.
export function LuniiScreen({ src, label, color = "#E2703A" }: { src: string | null; label: string; color?: string }) {
  return (
    <div className="lunii-screen">
      {src ? (
        <img src={src} alt={label} width={320} height={240} />
      ) : (
        <div className="lunii-default" style={{ background: color }}>
          {label}
        </div>
      )}
    </div>
  );
}
